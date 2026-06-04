# Research — 013 data observability

Phase 0 decisions. The spec deferred three plan-level details; planning resolved
those plus four implementation choices. No NEEDS CLARIFICATION remain.

## D1 — Monthly aggregate: direct psycopg (R8), NOT a SQL-function migration

- **Decision**: `storage/client.py` gains `bars_monthly_aggregate()` that runs
  the GROUP BY over `bars` via direct psycopg on `SUPABASE_DB_URL` — month
  bucketed in `America/New_York`, returning per-month `(month, bar_count,
  session_dates, sources)`. No migration.
- **Rationale**: the codebase already established this exact pattern (comment
  "R8") in `bars_present_session_dates`, used by the regime-coverage endpoint
  on this same table — aggregates go direct-to-Postgres rather than through
  PostgREST. Following it keeps one pattern, avoids a migration to author,
  apply, and keep in sync across environments.
- **Alternatives considered**: (a) the design doc's pencilled
  `bars_monthly_stats()` SQL function + migration 0130 — works, but adds a
  deploy step for zero gain at this scale; (b) PostgREST pagination + client
  aggregation — pulls ~165k rows to count them (the exact anti-pattern R8
  exists to avoid).
- **Note**: this is a deliberate refinement of the user-approved design doc
  (which said "one migration"); behavior and API shape are unchanged.

## D2 — "Last updated" = max(bars.created_at)

- **Decision**: cache last-changed time = `MAX(created_at)` over `bars`
  (column exists; computed in the same psycopg aggregate).
- **Rationale**: covers every ingestion path (backfill, refresh, download), not
  just backfills.
- **Alternatives**: latest successful `backfill_jobs.updated_at` — misses
  non-backfill ingestion (e.g. the auto-fetch on run).

## D3 — Month-cell state derivation is a pure function

- **Decision**: `api/coverage.py` gains a pure
  `month_stats(months_raw, expected_provider, today)` that derives, per month:
  `sessions_present`, `sessions_expected`, `missing_dates`, and state
  (`complete | partial | current | future`). Rules: months between the
  cache's earliest and latest are judged complete/partial (a zero-bar month
  inside the span is partial with all sessions missing); months outside the
  span are `future` (never "missing"); the current ET month is `current`,
  judged only against sessions ≤ today.
- **Rationale**: the holiday-vs-gap logic is the riskiest part — isolating it
  as a pure function over an injected expected-sessions provider makes it
  exhaustively unit-testable without a DB (same injection style
  `regime_coverage` already uses).
- **Alternatives**: compute inline in the router — untestable without HTTP
  scaffolding; client-side — rejected in the design (calendar lives server-side).

## D4 — Lineage counts via PostgREST `count="exact"`

- **Decision**: `runs_count()` and `studies_count()` use
  `select("id", count="exact")` head queries (precedent already in
  `storage/client.py`); `latest_run_at` = max `started_at` via a 1-row ordered
  select. Counts are of **persisted rows**, so they match the Runs page by
  construction (SC-007). Study child-evaluations (not persisted until feature
  014) are therefore not counted — correct, since the Runs page doesn't show
  them either.
- **Alternatives**: psycopg counts — fine too, but PostgREST count is already
  the in-repo precedent for row counts and needs no DB URL.

## D5 — History limit is a config knob

- **Decision**: `api.backfill.history_limit: 20` in `backend/config/config.yaml`
  (alongside the existing `api.backfill.*` knobs); the router reads it.
- **Rationale**: engineering standard — limits live in config, not source.

## D6 — Mixed-source months

- **Decision**: the aggregate returns the distinct `source` values per month;
  the heatmap hover renders them joined ("alpaca + yfinance"); the summary
  strip shows the distinct sources across the whole cache.
- **Rationale**: spec FR-004 requires "contributing source(s)"; per-bar source
  detail is overkill for the page's question.

## D7 — Auto-refresh on job completion

- **Decision**: the existing `useBackfillStatus` poller, on observing a
  transition into `finished`/`failed`, invalidates the `bars stats`, `backfill
  jobs`, and existing `coverage` query keys.
- **Rationale**: FR-003 with zero new polling machinery; TanStack invalidation
  is the established pattern (cf. config mutations invalidating `runs`).
