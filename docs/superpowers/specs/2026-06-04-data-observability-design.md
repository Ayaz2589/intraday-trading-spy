# Data page observability uplift — design

**Date:** 2026-06-04 · **Status:** approved (brainstormed + user-validated) ·
**Becomes:** Spec Kit feature `013-data-observability` (the roadmap's pencilled
"013 study child-runs" shifts to 014, insights to 015 — its numbers are
explicitly "proposed; adjust at spec time").

## Problem

The Data coverage page answers "is my multi-year cache complete?" with a regime
table, but after running a backfill the operator can't tell **what happened**:

- The backfill section shows ONE status line for the LATEST job
  (`finished · windows 103/103 · 1 bars added`). No when, no duration, no range,
  no history — the previous *failed* job (`No module named 'alpaca'`,
  2026-06-04) vanished from view the moment a new job ran.
- Nothing says what's actually **in** the cache: total bars, per-period
  breakdown, source (Alpaca SIP vs yfinance), last-updated.
- Nothing says where the **holes** are: which NYSE sessions (if any) are
  missing, and that a "missing" weekday that's a market holiday is not a gap.
- Nothing connects the data to what it **feeds**: the runs/studies built on it.

Everything needed already exists server-side: `backfill_jobs` stores every job
(status, source, range, windows, bars_added, `gap_session_dates`,
`failure_reason`, created/updated timestamps); the bars table can answer
count/source/per-period questions; the NYSE expected-session calendar logic
already powers the regime table.

## Scope decisions (user-confirmed)

1. **All four info gaps in one feature, with LIGHT lineage**: job history,
   cache contents, holes — done fully. "What it feeds" is a one-line summary
   (counts + latest run date + link to Runs); per-run/range linkage stays in
   the future insights feature (now 015).
2. **Month-grid heatmap** for cache completeness (rows = years, cells =
   months), not a per-year table.
3. **Backend approach A**: one `GET /api/bars/stats` endpoint returns the whole
   page snapshot; one `GET /api/bars/backfill` list endpoint for job history.
   One migration for the aggregate SQL function. No client-side calendar logic
   (the "what counts as a trading session" knowledge stays server-side), no
   materialized stats table (YAGNI at 165k rows).
4. **Keep the regime table** — it answers "does my data span distinct market
   eras", which the heatmap doesn't.

## Page layout (top to bottom)

```
Data coverage (?)
┌──────────────────────────────────────────────────────────┐
│ 164,919 bars · 2,118 sessions · 2018-01-02 → 2026-06-04  │  summary strip
│ Source: Alpaca SIP · Last updated 11:02 AM               │
│ Feeds 47 backtests + 14 studies · latest Jun 4 → Runs    │  light lineage
└──────────────────────────────────────────────────────────┘

Cache completeness (?)                                        NEW heatmap
        J  F  M  A  M  J  J  A  S  O  N  D
2018    ■  ■  ■  ■  ■  ■  ■  ■  ■  ■  ■  ■
  ⋮
2026    ■  ■  ■  ■  ■  □  ·  ·  ·  ·  ·  ·
■ complete  ▣ partial  □ current month  · future / not cached
  hover/tap a cell → "May 2026: 21/21 sessions · 1,638 bars · complete"
  partial cell hover lists the EXACT missing trading days

Regime completeness (?)                                       KEPT as-is

Backfill (?)            [From][To][Backfill history]          existing controls
Job history (?)                                               NEW table
  Started        Range            Windows  Bars added  Took  Status
  Jun 4 10:46AM  2018-01→2026-06  103/103  1           48s   finished
  Jun 4 10:31AM  2018-01→2026-06  0/103    0           1s    failed ⓘ
                                  (ⓘ hover → "No module named 'alpaca'")
```

Semantics: expected sessions come from the NYSE calendar (holidays/half-days
already excluded), so any day listed as missing is a REAL gap. "Missing: none"
means every expected session in the cached range is present.

## Backend

- **Migration `0130_bars_monthly_stats.sql`**: SQL function
  `bars_monthly_stats()` → rows `(month, source, session_count, bar_count)`
  (GROUP BY over `bars`; milliseconds at current scale). Applied to cloud the
  same way as 0120–0122 (direct psycopg + `SUPABASE_DB_URL`).
- **`GET /api/bars/stats`** → `BarsStatsResponse`:
  ```
  {
    totals:  { bars, sessions, earliest, latest, last_updated },
    months:  [ { month: "2026-06", sessions_present, sessions_expected,
                 bars, sources: ["alpaca"], missing_dates: [] } ],
    lineage: { runs_count, studies_count, latest_run_at }
  }
  ```
  `sessions_expected` + `missing_dates` reuse the existing
  `market_calendar` / `bars_present_session_dates` logic that powers the regime
  table. Lineage = two cheap counts (runs, validation_studies) + max date — no
  per-run linkage.
- **`GET /api/bars/backfill`** (no job_id) → newest-first list (limit 20) of
  `backfill_jobs` rows: created_at/updated_at (UI derives duration), status,
  source, range_start/end, windows_total/done, bars_added, gap_session_dates,
  failure_reason.
- **Storage client**: `bars_monthly_stats()` (RPC), `list_backfill_jobs(limit)`,
  `runs_count()` / `studies_count()` (PostgREST count queries).

## Frontend

- `useBarsStats` + `useBackfillJobs` TanStack queries. The existing backfill
  poller invalidates both when a job reaches `finished`/`failed`, so the
  heatmap/summary refresh automatically after a backfill.
- New components: summary strip, `CacheHeatmap` (pure presentation over the
  `months` array; cell states complete/partial/current/future), `JobHistoryTable`.
  Regime table and backfill controls unchanged.
- Error posture: sections render independently; a failed stats query shows
  "couldn't load cache stats" in that section only (the rest of the page still
  works — same best-effort posture as today's coverage endpoint). Empty cache
  keeps the existing "no bars yet" message.

## Educational tooltips (constitution VI)

New `HELP_CONTENT` keys, each rendered on the page:

- `cache_heatmap` — what complete/partial/future mean; holidays are already
  excluded, so a listed missing day is a real gap.
- `backfill_job_history` — what one job row is (chunked windows, dedupe), and
  why "1 bars added" over an already-full cache is the healthy outcome.
- `data_lineage` — what "feeds N backtests + M studies" means.

(Also: run-viewer's HELP_CONTENT-coverage test exclusion list gains these keys,
as 011/012 keys did.)

## Testing (constitution IV — TDD, tests first)

- Backend: `bars_monthly_stats` returns correct month rows from seeded bars;
  missing-date logic (a removed session shows as missing; a holiday doesn't);
  `/api/bars/stats` + `/api/bars/backfill` endpoint shapes (stub storage, same
  pattern as `test_configs_endpoints.py`); lineage counts.
- Frontend: heatmap renders complete/partial/current/future cells from fixture
  stats; partial-cell hover reveals the missing dates; job table renders
  duration + failure reason (the failed-alpaca row stays visible in history);
  tooltips render; help-content count test updated.

## Constitution touchpoints

I (SPY-only: unchanged, read-only views) · II (no ML/optimizer: n/a) ·
III (risk veto: untouched) · IV (TDD as above) · V (live stays disabled: n/a) ·
VI (three new `?` tooltips) · VII (journal: jobs are already journaled/recorded;
viewing adds no new mutations).

## Sequencing

1. **Merge `012-config-management` → main first** — this feature touches shared
   files (`help-content.ts`, run-viewer test exclusion list, data page) and
   branching off a main without 012 invites conflicts.
2. Then feed this doc to `/speckit-specify` as feature `013-data-observability`
   and flow through the standard pipeline (clarify → plan → tasks → analyze →
   implement).

## Out of scope (deferred)

Per-run/per-range data lineage drill-down (insights feature, now 015); any
mutation of bars or jobs from this page; per-day heatmap granularity; non-SPY
symbols (constitution I).
