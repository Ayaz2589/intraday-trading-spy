# Phase 0 Research — Data Foundation (009)

All decisions below resolve the unknowns in the plan's Technical Context. Format per decision: **Decision / Rationale / Alternatives**.

---

## R1 — Alpaca historical-bars SDK & request shape

**Decision**: Use the official **`alpaca-py`** SDK, `StockHistoricalDataClient(api_key, secret_key)`, with `StockBarsRequest(symbol_or_symbols="SPY", timeframe=TimeFrame(5, TimeFrameUnit.Minute), start, end, feed=DataFeed.IEX, adjustment=Adjustment.RAW)`. Iterate the returned bars, convert each to the project's normalized row (`bar_start` in ET ISO-8601, `open/high/low/close`, `volume`, `source="alpaca"`), filter to the regular session (09:30–16:00 ET), and drop zero/NaN-volume glitch rows — mirroring `Downloader._normalize`/`_drop_glitches`.

**Rationale**: `alpaca-py` is the maintained first-party client, handles pagination/auth, and returns typed bars. Matching the existing normalized-row contract means the new source is a drop-in for `upsert_bars()` and the dedup path. RAW adjustment keeps bars as-traded (intraday backtest wants actual prices, not split/div-adjusted).

**Alternatives**: Raw REST via `httpx` (more code, must hand-roll pagination tokens — rejected). `alpaca-trade-api` (deprecated predecessor — rejected). SIP feed (paid — see R6).

---

## R2 — Bypassing the yfinance 730-day request limit

**Decision**: Do **not** reuse `DownloadRequest` for the Alpaca path. `DownloadRequest._validate_dates` hard-rejects `start` older than `MAX_5M_HISTORY_DAYS=730` — a yfinance-specific limit that would block multi-year backfill. The Alpaca source takes plain `start: date, end: date` (and `symbol: str = "SPY"`) and does its own light validation (`start <= end`, not in the future).

**Rationale**: The 730-day cap is a property of *yfinance*, not of our data model. Coupling Alpaca to it defeats the entire feature.

**Alternatives**: Relax `MAX_5M_HISTORY_DAYS` globally (rejected — it correctly protects the yfinance path from impossible requests). Add a `source`-aware branch inside `DownloadRequest` (rejected — leaks source logic into a yfinance value object).

---

## R3 — `BarSource` abstraction (symbol-parameterizable, SPY-enforced)

**Decision**: Add a tiny `BarSource` Protocol in `data/bar_source.py`:

```python
class BarSource(Protocol):
    name: str  # "yfinance" | "alpaca"
    def fetch_rows(self, *, start: date, end: date, symbol: str = "SPY",
                   timeframe: str = "5m") -> list[BarRow]: ...
```

`BarRow` is the existing normalized dict shape (`bar_start, open, high, low, close, volume, source`). Wrap the existing yfinance `Downloader` behind `YfinanceBarSource` (thin adapter) and implement `AlpacaBarSource`. The `symbol` arg exists for future multi-symbol work but **raises if `symbol != "SPY"`** today (constitution I).

**Rationale**: FR-002 ("same fetch interface/shape") + the roadmap's "design symbol-parameterizable now, enable later." A Protocol keeps the engine/read path agnostic to vendor. Enforcing SPY at the boundary satisfies Principle I while leaving the seam for expansion.

**Alternatives**: Subclass `Downloader` for Alpaca (rejected — `Downloader` is yfinance/pandas/CSV-coupled; inheritance would drag that in). No abstraction, just a second function (rejected — dedup/read code would special-case vendors).

---

## R4 — Cross-source dedup: where and how (prefer Alpaca)

**Decision**: Enforce "exactly one bar per `bar_start`" in **`materialize_bars_csv()`** (`api/lifecycle.py`), the single function that turns cached rows into the CSV the engine reads. Two changes: (1) `storage_client.list_bars()` must **also select `source`**; (2) after fetching, group by `bar_start` and keep the row whose `source` ranks highest in `data.source_preference` (default `["alpaca", "yfinance"]`). Stable, deterministic, in-memory.

**Rationale**: This is the one chokepoint every backtest passes through; fixing it here guarantees no double-counting regardless of how bars got cached. Keeping `UNIQUE(bar_start, source)` (not collapsing to `UNIQUE(bar_start)`) preserves both vendors' rows for later comparison (R6) while the read path picks one. Config-driven precedence honors "no magic numbers in source."

**Alternatives**: A DB view / `DISTINCT ON (bar_start) ... ORDER BY source_rank` (cleaner SQL, but it's DDL applied manually and PostgREST can't express `DISTINCT ON` easily — defer to a later optimization; the Python dedup is testable now). Collapsing the unique key to `bar_start` only (rejected — destroys the IEX-vs-consolidated comparison and makes upserts lossy).

---

## R5 — Backfill background job + progress (mirror `data_download_jobs`)

**Decision**: Mirror the existing, working pattern: FastAPI `BackgroundTasks` launched from `POST /api/bars/backfill`, a new `backfill_jobs` table for durable status/progress, and `GET /api/bars/backfill/{job_id}` to poll. The runner loops Alpaca windows (`api.backfill.window_days`, default 30) updating `windows_done/windows_total`, accumulating `bars_added` and `gap_session_dates`, setting `status` queued→running→finished/failed. Concurrency capped per user (`api.backfill.max_concurrent_per_user`, default 1) via a count check, exactly like `count_active_data_downloads`.

**Rationale**: Reuses a proven, already-deployed mechanism (status table + poll endpoint + cap) rather than inventing one. Window-by-window progress makes a minutes-long multi-year load observable (FR-004a) and naturally **resumable/idempotent** (FR-005/6): `upsert_bars` is `ON CONFLICT DO NOTHING`, so re-running already-cached windows adds zero rows.

**Alternatives**: A real task queue (Celery/Arq/Redis — rejected, infra overkill for a rare operator job). Synchronous request (rejected — a multi-year fetch would time out; this is exactly why FR-004a mandates background + progress). One generic `jobs` table shared with downloads (rejected — different progress fields; a dedicated table is clearer and avoids migrating the live downloads table).

---

## R6 — Alpaca free tier = IEX feed: the VWAP-fidelity risk (IMPORTANT)

**Decision**: Backfill with the **IEX feed** (the free tier the provided keys grant) and **explicitly document the limitation**, plus add a validation step: on the ~60-day window where Alpaca(IEX) and yfinance(consolidated) overlap, **quantify the VWAP discrepancy** before trusting multi-year IEX backtests. Keep both sources' rows (R4) so this comparison is always possible.

**Rationale (honesty — this is the roadmap's whole ethos)**: IEX is a *single venue* carrying only a few % of SPY volume. For SPY, **price (OHLC) tracks the consolidated tape tightly** (heavy arbitrage), so price-based logic is fine. But **volume is not consolidated**, and this strategy is **VWAP**-pullback — VWAP is volume-weighted, so an IEX-derived VWAP can drift from the consolidated VWAP real traders see. Silently backtesting a VWAP edge on IEX volume risks measuring a slightly different indicator than we'd trade. We accept IEX for Phase 0 (it uniquely gives cheap multi-year history and is the same vendor we'll trade) **but flag it** and measure the gap rather than assume it away.

**Alternatives**: Pay for the **SIP feed** (consolidated; ~$99/mo) — correct long-term if the overlap test shows material VWAP drift; a user cost decision, deferred and surfaced. Use yfinance (consolidated) for everything (rejected — only ~60 days, the original blocker). Switch VWAP to a price-only proxy (rejected — changes the strategy; out of scope, constitution II).

> **Surfaced to operator**: this is the one finding worth a decision — proceed on IEX now and measure the discrepancy, or buy SIP up front. Plan proceeds on IEX + measure.

---

## R7 — Expected-session denominator for the 90% "covered" rule

**Decision**: Compute expected regular-session trading days per regime window with **`pandas-market-calendars`** (`mcal.get_calendar("XNYS").schedule(start, end)` → row count = expected sessions). "Covered" = `present_sessions / expected_sessions ≥ data.regime_covered_threshold_pct/100` (default 90).

**Rationale**: A real exchange calendar (NYSE holidays, half-days) is the only honest denominator for a completeness %. `pandas-market-calendars` is mature and pandas is already a dependency. Half-days still count as one session for a day-level completeness measure (we count session *days* present, not bars).

**Alternatives**: `exchange_calendars` (also fine; `pandas-market-calendars` chosen for lighter pandas alignment). Weekdays-minus-static-holiday-list (rejected — drifts as holidays change, gives a wrong denominator). Bars-based heuristic (rejected — circular: can't measure completeness against itself).

---

## R8 — Per-regime completeness query (PostgREST vs psycopg)

**Decision**: Add a storage method that returns the set of **distinct present session-days** (ET date) within a window, computed with a single SQL aggregate via **psycopg** over `SUPABASE_DB_URL` (already configured), then count present vs expected (R7) in Python. The plain `earliest/latest` coverage stays on the existing PostgREST `bars_coverage()`.

**Rationale**: Counting distinct session-days across ~100k rows is an aggregate; PostgREST doesn't expose `COUNT(DISTINCT date(...))` cleanly, and pulling every row to count in Python is wasteful. psycopg is already wired for direct reads (Phase "direct DB access" work). This is a **read**, so it sidesteps the manual-DDL constraint (which only governs schema changes).

**Alternatives**: A Postgres RPC `bars_session_dates(start, end)` called via PostgREST `.rpc()` (clean, but creating the function is manual DDL — viable later optimization). Pull all `bar_start` and dedupe in Python (rejected — transfers ~100k rows per coverage call).

---

## R9 — Migrations (index + jobs table), applied manually

**Decision**: Two new migration files, applied by hand in the Supabase SQL editor (project practice): `0093_bars_bar_start_index.sql` → `CREATE INDEX IF NOT EXISTS bars_bar_start_idx ON public.bars (bar_start);` and `0094_backfill_jobs.sql` → the `backfill_jobs` table + RLS (authenticated read, service-role all), mirroring `0013_rls_policies_bars.sql`.

**Rationale**: Range reads (`gte/lt bar_start`) currently scan; the index makes multi-year `list_bars` fast (SC-006). Numbering continues after the current max (`0092`). Manual application matches the existing migration workflow ([[intraday-supabase-migrations]]).

**Alternatives**: Composite `(bar_start, source)` already exists as the unique constraint's implicit index, but it's `(bar_start, source)`-ordered and Postgres *can* use its leading column for `bar_start` ranges — however an explicit `(bar_start)` index is unambiguous and cheap; keep it. A `BRIN` index (rejected — B-tree is right for these bounded range scans at this size).

---

## R10 — Session/timezone handling reuse

**Decision**: Reuse the existing ET regular-session window (09:30–16:00, America/New_York) when normalizing Alpaca bars. Prefer the existing `clock.py` session helpers; if the Alpaca normalizer instead mirrors `downloader.py`'s `SESSION_START/SESSION_END` filter, factor that filter into one shared helper rather than introducing a *third* copy.

**Rationale**: Constitution engineering standard — `clock.py` is the single source of truth for session timing; avoid a third duplicated session constant.

**Alternatives**: New per-source session constants (rejected — duplication the constitution warns against).

---

## Resolved unknowns checklist

- [x] Alpaca SDK + request shape (R1) · [x] 730-day limit bypass (R2) · [x] BarSource abstraction (R3)
- [x] Dedup location + precedence (R4) · [x] Background job + progress (R5) · [x] IEX/VWAP risk + mitigation (R6)
- [x] Expected-session calendar (R7) · [x] Completeness query path (R8) · [x] Migrations (R9) · [x] Session reuse (R10)

No remaining `NEEDS CLARIFICATION`.
