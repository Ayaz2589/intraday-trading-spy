# Phase 1 Data Model: Historical SPY Loader

All models live in
`backend/src/intraday_trade_spy/data/downloader.py`. They are
NOT added to Feature 001's `models.py`, which is reserved for trading
domain entities (Bar, Signal, etc.). All models use Pydantic v2.

---

## `Timeframe` (Literal alias)

```python
Timeframe = Literal["5m", "1m"]
```

Only intraday timeframes in v1; daily / weekly / monthly are out of
scope.

---

## `DataSource` (Literal alias)

```python
DataSource = Literal["yfinance", "mock"]
```

`"yfinance"` for production runs (the CLI). `"mock"` for any test that
injects a synthetic `download_fn`.

---

## `DownloadRequest` (frozen)

```python
class DownloadRequest(BaseModel):
    model_config = ConfigDict(frozen=True)
    start: date
    end: date
    timeframe: Timeframe = "5m"
    out: Path
    force: bool = False
    show_progress: bool = True

    @model_validator(mode="after")
    def _validate_dates(self) -> "DownloadRequest":
        today = date.today()
        if self.start > self.end:
            raise ValueError(f"start ({self.start}) must be <= end ({self.end})")
        if self.start > today or self.end > today:
            raise ValueError(f"start/end must not be in the future (today={today})")
        max_history = MAX_5M_HISTORY_DAYS  # module constant
        oldest_allowed = today - timedelta(days=max_history)
        if self.start < oldest_allowed:
            raise ValueError(
                f"start ({self.start}) is older than yfinance's {max_history}-day "
                f"history limit; earliest allowed is {oldest_allowed}"
            )
        return self
```

This is the single source of truth for date validation. The CLI parses
argparse strings, builds a `DownloadRequest`, and any ValidationError
is surfaced to stderr with exit code 2.

---

## `FetchResult` (frozen)

```python
class FetchResult(BaseModel):
    model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)
    raw_df: pd.DataFrame = Field(..., exclude=True)
    requested_start: date
    requested_end: date
    fetched_bar_count: int
    was_retried: bool = False
```

One per yfinance call. The chunker yields one `FetchResult` per
window. The downloader concatenates them into the final output.

`raw_df` is excluded from serialization (it's a DataFrame, not
serializable to YAML / JSON).

---

## `FetchManifest` (frozen)

```python
class FetchManifest(BaseModel):
    model_config = ConfigDict(frozen=True)
    fetched_at: AwareDatetime          # UTC
    yfinance_version: str
    requested_start: date
    requested_end: date
    requested_timeframe: Timeframe
    output_path: str                   # relative or absolute, as given
    bar_count: int
    session_count: int
    gap_session_dates: list[date]      # ISO dates within range with zero bars
    output_sha256: str                 # 64 hex chars
    data_source: DataSource
```

Serialized to `<csv>.fetch.yaml` via
`yaml.safe_dump(..., sort_keys=True, default_flow_style=False)`.

---

## Module Constants (in `downloader.py`)

```python
MAX_CHUNK_DAYS = 60                # yfinance's per-call 5m window
MAX_5M_HISTORY_DAYS = 730          # yfinance's 5m history limit
RETRY_BACKOFF_SECONDS = 5          # delay between attempts on 429
RETRY_MAX_ATTEMPTS = 2             # initial + 1 retry
ET = ZoneInfo("America/New_York")
```

These are NOT in `config.yaml` (see research.md Decision 9).

---

## Functions

### `iter_windows(start: date, end: date, max_days: int = MAX_CHUNK_DAYS) -> list[tuple[date, date]]`

Pure function. Returns a list of `(window_start, window_end)` tuples
covering `[start, end]` inclusive, where each window spans at most
`max_days`. Windows are consecutive and non-overlapping at the day
level. Used by both production and tests.

Example: `iter_windows(date(2026,1,1), date(2026,4,1), 60)` →
`[(date(2026,1,1), date(2026,3,1)), (date(2026,3,2), date(2026,4,1))]`.

---

### `Downloader.fetch(self, req: DownloadRequest) -> FetchManifest`

Method. Composes the chunker + `download_fn`:
1. Validates that `req.out` doesn't exist (unless `req.force`).
2. Calls `iter_windows` to build the window list.
3. For each window: calls `self._download_fn(...)`, retrying once on
   429. Yields a `FetchResult`.
4. Concatenates raw DataFrames; normalizes column names; tags every
   row with `symbol="SPY"`; drops NaN/zero-volume rows; converts
   timestamps to ET; filters to regular session.
5. Writes the CSV to `req.out` with deterministic formatting
   (`{:.4f}` for OHLC, integer volume, ISO 8601 timestamps).
6. Hashes the on-disk CSV bytes → `output_sha256`.
7. Builds and returns a `FetchManifest`.
8. Writes the manifest to `<req.out>.fetch.yaml`.

---

## Validation Rules Map (FR → model / function)

| FR | Where enforced |
|----|----------------|
| FR-001 (CLI flags) | `cli/download_spy_data.py` argparse + `DownloadRequest` |
| FR-002 (SPY only) | `DownloadRequest` has no symbol; Downloader's internal symbol param typed `Literal["SPY"]` |
| FR-003 (yfinance.download call) | `Downloader._call_yf` (injectable `download_fn`) |
| FR-004 (chunking) | `iter_windows()` + `Downloader.fetch` loop |
| FR-005 (column normalization) | `Downloader._normalize_df` |
| FR-006 (sort / dedupe) | `Downloader.fetch` after concatenation |
| FR-007 (session filter) | `Downloader._filter_session` (uses Feature 001's `MarketConfig` times) |
| FR-008 (manifest) | `FetchManifest` model + `Downloader._write_manifest` |
| FR-009 (fail-fast errors) | `DownloadRequest._validate_dates` + `Downloader.fetch` pre-checks |
| FR-010 (429 retry) | `Downloader._call_yf` retry loop |
| FR-011 (drop NaN/zero volume) | `Downloader._drop_glitches` + stdout log |
| FR-012 (TDD) | Enforced in `tasks.md` task ordering |
| FR-013 (mocks + slow mark) | `conftest.py` fixtures |
| FR-014 (Feature 001 compatibility) | Integration test in `test_yfinance_integration.py` (slow) |
| FR-015 (byte-identical reproducibility) | Deterministic format strings + `test_downloader.py::test_byte_identical_under_mock` |
