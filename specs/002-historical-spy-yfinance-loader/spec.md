# Feature Specification: Historical SPY Loader — yfinance Downloader

**Feature Branch**: `002-historical-spy-yfinance-loader`

**Created**: 2026-05-28

**Status**: Draft

**Input**: User description: "Feature 002 of intraday-trade-spy: a CLI
that downloads real historical SPY 5-minute bars from Yahoo Finance via
`yfinance` and writes a CSV in the exact schema that Feature 001's
loader expects. Required because Feature 001 ships only a synthetic
fixture; this feature unblocks real-data research without depending on
Alpaca (Feature 010). Governance: Constitution v1.1.0 (Test-First
Everywhere)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Download SPY bars into a Feature-001-readable CSV (Priority: P1)

The user wants to run a backtest against real SPY market data instead of
the bundled synthetic fixture. They run a single CLI command with a
start date and an end date, and they get back a CSV that Feature 001's
`load_bars()` consumes without modification.

**Why this priority**: This is the entire reason the feature exists.
Every other story improves the quality or breadth of the fetch; P1 alone
delivers the unblock.

**Independent Test**: Run
`python backend/scripts/download_spy_data.py --start 2026-04-01 --end 2026-05-28`,
then
`python -m intraday_trade_spy.cli.run_backtest --config backend/config/config.yaml --data <downloaded-csv>`.
The backtester completes with a non-empty journal and a summary block.

**Acceptance Scenarios**:

1. **Given** valid `--start` and `--end` flags covering a date range
   within yfinance's 5m history window, **When** the CLI runs, **Then**
   it writes a CSV to `backend/data/raw/spy_5m_<start>_<end>.csv` with
   columns exactly `symbol,timestamp,open,high,low,close,volume` in
   that order, every row's symbol = `"SPY"`, and timestamps in ISO 8601
   with the ET offset.
2. **Given** the CSV produced in scenario 1, **When** Feature 001's
   `load_bars()` is called on it, **Then** the loader returns a
   normalized DataFrame with no errors.
3. **Given** the user supplies `--out PATH`, **When** the CLI runs,
   **Then** the CSV is written to `PATH` instead of the default path.

---

### User Story 2 - Chunk ranges larger than yfinance's window (Priority: P2)

yfinance returns at most ~60 days of 5-minute bars per call. The user
should be able to request 6 months or a year in one command without
knowing about that limit.

**Why this priority**: Without chunking, the feature is artificially
crippled to ~60-day fetches. P2 makes the feature suitable for
year-scale research.

**Independent Test**: Request a 120-day range. Verify (a) stdout shows
two chunk-fetch progress lines (unless `--no-progress` is set), and (b)
the resulting CSV covers the full range with no duplicate timestamps.

**Acceptance Scenarios**:

1. **Given** a `--start`/`--end` range of 120 days, **When** the CLI
   runs at the 5m timeframe, **Then** the downloader issues two yfinance
   calls (each ≤60 days), concatenates the results, deduplicates by
   timestamp, sorts ascending, and writes a single CSV covering the
   full range.
2. **Given** a 120-day range with `--no-progress`, **When** the CLI
   runs, **Then** stdout contains only the final summary line, not the
   per-chunk progress.

---

### User Story 3 - Symbol is locked to SPY (Priority: P3)

The constitution forbids any non-SPY instrument in v1. The CLI should
not even *suggest* that another symbol is possible.

**Why this priority**: Compliance with constitution principle I.
Lower-priority than P1/P2 because the constitution already gates this
elsewhere, but it must hold at the CLI surface.

**Independent Test**: Run
`python backend/scripts/download_spy_data.py --help`. The help output
contains no `--symbol`, no `--ticker`, and no `--instrument` flag.

**Acceptance Scenarios**:

1. **Given** a fresh CLI invocation, **When** `--help` is printed,
   **Then** no symbol/ticker/instrument flag appears.
2. **Given** any internal symbol parameter in the downloader module,
   **When** a value other than `"SPY"` is supplied programmatically,
   **Then** the call fails at type-check time (or at runtime
   validation) with an error citing constitution principle I.

---

### User Story 4 - Reproducible, inspectable fetches (Priority: P4)

The user needs to be able to look at a downloaded CSV weeks later and
know exactly what was fetched, when, and from what.

**Why this priority**: Without provenance, downloaded CSVs become
mysterious artifacts that the user can't tell apart. P4 enables
research notebooks to cite their data.

**Independent Test**: After a fetch, open the sidecar
`<csv>.fetch.yaml` and verify: `fetched_at` is a valid UTC ISO 8601
timestamp, `yfinance_version` matches the installed version,
`output_sha256` matches `sha256sum <csv>`, `bar_count` matches
`wc -l <csv> - 1` (header), `data_source` is `"yfinance"` in production
and `"mock"` in tests.

**Acceptance Scenarios**:

1. **Given** a successful fetch, **When** the CLI completes, **Then** a
   sidecar manifest at `<output>.fetch.yaml` exists and contains all
   fields listed in FR-008.
2. **Given** any session date inside the requested range that produced
   zero bars (weekends, US market holidays, yfinance gaps), **When** the
   manifest is read, **Then** the date appears in `gap_session_dates`
   as an ISO date.
3. **Given** the user opens the manifest, **When** they compute
   `sha256sum` of the CSV themselves, **Then** the digest matches
   `output_sha256` exactly.

---

### User Story 5 - Fast offline tests; one opt-in live test (Priority: P5)

The unit test suite must run offline, deterministically, and fast.
Exactly one integration test hits the real yfinance API and is opt-in.

**Why this priority**: This is a discipline gate. Without it, the test
suite becomes flaky (yfinance is occasionally rate-limited or down) and
slow (network round-trips). P5 keeps the project healthy long-term.

**Independent Test**: Disconnect from the internet (or use
`pytest --deselect` for the slow test). Run
`pytest -m "not slow" backend/tests/`. The full suite passes.

**Acceptance Scenarios**:

1. **Given** no network connection, **When** `pytest -m "not slow"`
   runs, **Then** every test passes and no test attempts a network
   call.
2. **Given** an opt-in invocation `pytest -m slow`, **When** the slow
   test runs, **Then** it makes exactly one real yfinance call and
   asserts the returned CSV passes Feature 001's loader.

---

### Edge Cases

- **`--start` later than `--end`** — Fail fast with a clear error
  message naming both dates; exit code non-zero.
- **`--start` or `--end` in the future** — Fail fast with a clear
  error naming the offending flag; exit code non-zero.
- **Date range older than yfinance's 5m history limit (~730 days)** —
  Fail fast with a clear error citing the 730-day limit; exit code
  non-zero.
- **yfinance returns zero rows** — Fail fast with an error naming the
  requested range and suggesting common causes (range entirely on
  weekends, range outside the 730-day window).
- **yfinance returns rows with NaN or zero volume** — Drop those rows
  silently from the output CSV and log the dropped count to stdout
  (these are known Yahoo glitches at session boundaries).
- **yfinance returns column names that differ from the expected
  (`Adj Close` vs `Close`, multi-index columns when the underlying API
  returns a multi-symbol payload)** — Normalize to the expected
  single-symbol schema; if normalization is ambiguous (e.g., multiple
  candidate close columns), fail fast with an error naming the
  unexpected columns.
- **yfinance returns HTTP 429 (rate limit)** — Retry the failing chunk
  once after a 5-second backoff. If the second attempt also returns
  429, fail fast.
- **Output path already exists** — Fail fast unless `--force` is
  passed.
- **yfinance version mismatch (older than 0.2.40)** — Warn at startup,
  but proceed (the API contract has been stable since 0.2.40).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose a CLI at
  `backend/scripts/download_spy_data.py` accepting `--start YYYY-MM-DD`
  and `--end YYYY-MM-DD` (both required), plus optional
  `--timeframe` (default `5m`, allowed: `5m`, `1m`),
  `--out PATH` (default
  `backend/data/raw/spy_{timeframe}_{start}_{end}.csv`),
  `--force` (overwrite existing output), and
  `--no-progress` (suppress per-chunk progress lines).
- **FR-002**: System MUST hardcode the instrument to SPY. The CLI MUST
  NOT expose a `--symbol`, `--ticker`, or `--instrument` flag. Any
  internal symbol parameter MUST be typed `Literal["SPY"]`.
- **FR-003**: System MUST fetch SPY bars from yfinance via
  `yfinance.download(tickers="SPY", interval=<timeframe>,
  start=<start>, end=<end>, auto_adjust=False, progress=False)`.
- **FR-004**: For requested ranges larger than 60 days at the 5m or 1m
  timeframe, system MUST split the request into consecutive ≤60-day
  windows, fetch each in order, concatenate, deduplicate by timestamp,
  and sort ascending.
- **FR-005**: System MUST normalize the resulting DataFrame to the
  exact column order
  `symbol,timestamp,open,high,low,close,volume`. The `symbol` column
  MUST be `"SPY"` on every row. Timestamps MUST be ISO 8601 with the
  ET offset (`-04:00` during EDT, `-05:00` during EST).
- **FR-006**: Output rows MUST be sorted ascending by timestamp.
  Duplicate timestamps (which can occur at chunk boundaries) MUST be
  dropped, keeping the first occurrence.
- **FR-007**: Output MUST be filtered to the regular trading session
  (09:30–16:00 ET, half-open at 16:00) before write.
- **FR-008**: System MUST write a sidecar manifest at
  `<output>.fetch.yaml` containing:
  `fetched_at` (UTC ISO 8601), `yfinance_version`,
  `requested_start`, `requested_end`, `requested_timeframe`,
  `output_path`, `bar_count`, `session_count`,
  `gap_session_dates` (ISO date strings inside the range with zero
  bars), `output_sha256`, and `data_source`
  (`"yfinance"` or `"mock"`).
- **FR-009**: System MUST fail fast (non-zero exit, error on stderr)
  if: `--start` > `--end`; either flag is a future date; yfinance
  returns zero rows after retries; output exists and `--force` was not
  passed; the date range exceeds the 730-day 5m history limit.
- **FR-010**: On HTTP 429 from yfinance, system MUST retry the failing
  chunk once after a 5-second backoff. On a second 429, fail fast.
- **FR-011**: System MUST drop rows whose `volume` is NaN or zero
  before write and MUST log the dropped count to stdout.
- **FR-012**: All non-trivial source files added by this feature
  (`backend/src/intraday_trade_spy/data/downloader.py`,
  `backend/src/intraday_trade_spy/cli/download_spy_data.py`,
  and any new helper modules) MUST be developed test-first per
  constitution v1.1.0 principle IV. Every implementation task in
  this feature's `tasks.md` MUST be preceded by a failing-test task.
- **FR-013**: Unit tests MUST mock `yfinance.download` using
  `unittest.mock.patch` with deterministic synthetic DataFrames so the
  test suite runs entirely offline. One integration test MUST be
  marked `@pytest.mark.slow`, hit the real yfinance API, and be
  skipped by default (`pytest -m "not slow"` excludes it).
- **FR-014**: The output CSV produced by this feature MUST be
  consumable by Feature 001's `load_bars()` with zero modifications.
  An integration test MUST assert this on at least one fixture.
- **FR-015**: Re-running with identical CLI flags and identical mocked
  yfinance responses MUST produce byte-identical CSV output AND
  byte-identical sidecar manifest (with the exception of
  `fetched_at`, which is the wall-clock time and is allowed to
  differ — the test explicitly excludes it from the byte comparison).

### Key Entities

- **DownloadRequest** — validated CLI flags. Fields: `start` (date),
  `end` (date), `timeframe` (`"5m"` | `"1m"`), `out` (Path),
  `force` (bool), `show_progress` (bool).
- **FetchResult** — output of one yfinance call. Fields: raw DataFrame,
  requested window (start/end), returned bar count, was-retry flag.
- **FetchManifest** — sidecar YAML payload. Fields match FR-008.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can fetch 30 days of SPY 5m data and write the
  CSV end-to-end in under 60 seconds on a residential connection.
- **SC-002**: 100% line coverage of the downloader and chunker
  modules under mocked yfinance (the `slow` integration test is
  excluded from this measurement).
- **SC-003**: A CSV produced by this feature loads via Feature 001's
  `load_bars()` and runs a clean backtest with zero errors on at
  least three independent date ranges (verified by a parametrized
  integration test).
- **SC-004**: Byte-identical reproducibility when re-running offline
  with the same mocked yfinance responses (asserted in tests; sidecar
  comparison excludes `fetched_at`).
- **SC-005**: Running `pytest -m "not slow"` issues zero network
  calls (verified by patching `socket.socket` in a session-scope
  fixture).

## Assumptions

- yfinance v0.2.40+ is the available library. Its API may shift; we
  isolate that risk via mocks in unit tests.
- yfinance's 5-minute history window is approximately 730 days as of
  2026-05-28; the 60-day per-call chunk size is also accurate as of
  that date. Both are tunable constants in code, not magic numbers
  in tests.
- This feature does NOT replace the synthetic fixture from Feature
  001 — that fixture remains as deterministic test data. This
  feature produces research-grade real data.
- The user is on a residential connection and can tolerate a 60-second
  fetch for 30 days of data.
- Out of scope (each may become a later feature): multi-symbol
  downloads, daily / weekly / monthly bars, incremental update /
  cache layer, persistent storage, automatic source fallback,
  Alpaca data integration (Feature 010).
- Constitution v1.1.0 governs this feature. Principles I (SPY-only),
  IV (Test-First Everywhere), and VII (Journal — interpreted here as
  the fetch manifest) are touched; all others are not.
