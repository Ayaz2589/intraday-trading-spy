# Phase 1 Data Model — Data Foundation (009)

Entities, fields, validation, and relationships. New/changed items are marked. SPY-only throughout (constitution I); `symbol` appears only as a SPY-defaulted, SPY-enforced parameter, never as stored data.

---

## Bar (existing — unchanged schema)

A single regular-session SPY 5-minute OHLCV record. The atomic unit of every backtest.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `bar_start` | TIMESTAMPTZ | bar open time; **gets a new index** (R9) |
| `open/high/low/close` | NUMERIC(12,6) | `CHECK (> 0)` |
| `volume` | BIGINT | `CHECK (>= 0)` |
| `source` | TEXT | `'yfinance'` or **`'alpaca'`** (new value); default `'yfinance'` |
| `created_at` | TIMESTAMPTZ | `now()` |

**Constraints**: `UNIQUE (bar_start, source)` (unchanged — both vendors may store the same timestamp). RLS: authenticated read, service-role write (unchanged).

**Validation (applied before upsert, by the bar source)**: regular session 09:30–16:00 ET; OHLC sanity (`high ≥ max(open,close)`, `low ≤ min(open,close)`, all `> 0`); volume present and `> 0` (glitch drop). Rows failing validation are rejected and counted, not stored (FR-010).

**New index** (migration `0093`): `CREATE INDEX IF NOT EXISTS bars_bar_start_idx ON public.bars (bar_start);`

---

## BarSource (new — code abstraction, not stored)

Protocol unifying bar providers so the read/backfill paths are vendor-agnostic.

```python
class BarSource(Protocol):
    name: str                      # "yfinance" | "alpaca"
    def fetch_rows(self, *, start: date, end: date,
                   symbol: str = "SPY", timeframe: str = "5m") -> list[BarRow]: ...
```

- **`BarRow`**: the normalized dict `{bar_start: iso-str(ET), open, high, low, close, volume, source}` — identical to what `_parse_csv` / `upsert_bars` already consume.
- **Implementations**: `YfinanceBarSource` (adapts existing `Downloader`), `AlpacaBarSource` (new; `alpaca-py`, IEX feed, RAW adjustment).
- **Validation**: `symbol != "SPY"` → raise (constitution I). Future symbols are a deliberate later expansion.
- **Relationship**: produces `Bar` rows; consumed by the backfill runner and the recent-fetch path.

---

## BackfillJob (new — `backfill_jobs` table)

Durable record + progress for an operator-triggered bulk backfill. Mirrors `data_download_jobs`. Satisfies FR-004a (progress) and FR-008 (auditable operator record).

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | the `job_id` returned to the client |
| `user_id` | UUID | who triggered (RLS scoping) |
| `status` | TEXT | `queued` → `running` → `finished` \| `failed` |
| `source` | TEXT | `'alpaca'` (default); the vendor used |
| `range_start` | DATE | requested span start |
| `range_end` | DATE | requested span end (inclusive) |
| `windows_total` | INT | number of fetch windows (progress denominator) |
| `windows_done` | INT | windows completed (progress numerator) |
| `bars_added` | INT | net new bars upserted (excludes dedup'd) |
| `gap_session_dates` | JSONB | sessions that returned empty/short |
| `failure_reason` | TEXT NULL | set when `status='failed'` |
| `created_at` | TIMESTAMPTZ | `now()` |
| `updated_at` | TIMESTAMPTZ | bumped on each progress write |

**State transitions**: `queued` (insert) → `running` (runner start) → progress writes bump `windows_done`/`bars_added`/`gap_session_dates` → terminal `finished` or `failed` (with `failure_reason`). No transitions out of terminal states.

**Validation**: `range_start ≤ range_end`; not in the future; `0 ≤ windows_done ≤ windows_total`. Concurrency: at most `api.backfill.max_concurrent_per_user` non-terminal jobs per user.

**RLS** (migration `0094`): authenticated users read their own (`user_id = auth.uid()`); service-role full access. Mirrors `0013_rls_policies_bars.sql`.

---

## Coverage (new shape — computed, not stored)

What the operator sees: the effective span plus per-regime completeness. Returned by `GET /api/bars/coverage` (extended).

| Field | Type | Notes |
|---|---|---|
| `earliest` | date \| null | oldest cached `bar_start` (existing) |
| `latest` | date \| null | newest cached `bar_start` (existing) |
| `regimes` | RegimeCoverage[] | **new** — one entry per configured regime |

**RegimeCoverage**:

| Field | Type | Notes |
|---|---|---|
| `name` | string | e.g. `"2022 bear"` |
| `start` / `end` | date | regime window bounds (from config) |
| `expected_sessions` | int | NYSE trading days in window (R7, `pandas-market-calendars`) |
| `present_sessions` | int | distinct ET session-days with ≥1 bar (R8, psycopg aggregate) |
| `completeness_pct` | number | `present/expected*100`, rounded |
| `covered` | bool | `completeness_pct ≥ data.regime_covered_threshold_pct` (default 90) |

**Note**: coverage reflects the **effective (deduped)** view — counts of session-days, independent of how many sources stored each bar.

---

## RegimeWindow (new — config, not stored)

The yardstick for "multi-regime." Lives in `config.yaml` (no magic numbers in source).

```yaml
data:
  source_preference: [alpaca, yfinance]      # read precedence (R4)
  regime_covered_threshold_pct: 90           # "covered" bar (clarify Q3)
  regimes:
    - { name: "2020 volatility",    start: 2020-01-01, end: 2020-12-31 }
    - { name: "2021 bull",          start: 2021-01-01, end: 2021-12-31 }
    - { name: "2022 bear",          start: 2022-01-01, end: 2022-12-31 }
    - { name: "2023-24 chop/trend", start: 2023-01-01, end: 2024-12-31 }
```

Config models (Pydantic v2): `RegimeWindow{name,start,end}`, `DataConfig += {source_preference: list[str], regime_covered_threshold_pct: float, regimes: list[RegimeWindow]}`, new `AlpacaConfig{feed: Literal["iex","sip"] = "iex"}`. Alpaca **secrets stay in env**, never in these models/YAML.

---

## Entity relationships

```
BarSource (yfinance | alpaca)  --produces-->  Bar rows  --stored in-->  public.bars
                                                   |
BackfillJob --drives bulk fetch via--> BarSource    | (read path)
                                                   v
Coverage  <--computed from--  distinct session-days in public.bars  +  RegimeWindow (config) + NYSE calendar
                                                   |
materialize_bars_csv  --reads list_bars(+source), dedups by source_preference-->  one Bar per bar_start  -->  engine
```
