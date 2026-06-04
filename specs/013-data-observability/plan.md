# Implementation Plan: Data Observability — coverage, backfill history & lineage

**Branch**: `013-data-observability` | **Date**: 2026-06-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/013-data-observability/spec.md` + user-approved design `docs/superpowers/specs/2026-06-04-data-observability-design.md`

## Summary

Flesh out the Data page so the operator understands *what happened*: a backfill
job-history table (incl. failures + reasons), a cache summary strip (totals,
source, last-updated), a year×month completeness heatmap whose partial cells
reveal the exact missing trading days, and a one-line lineage summary (N
backtests + M studies). Backend = one page-snapshot endpoint
(`GET /api/bars/stats`) + a jobs-list endpoint (`GET /api/bars/backfill`),
both reading data that already exists. **No DB migration**: the monthly
aggregate uses the established R8 direct-psycopg pattern
(`bars_present_session_dates` precedent) instead of the design doc's pencilled
SQL function — see research.md D1.

## Technical Context

**Language/Version**: Python 3.11 (backend), TypeScript 5 / React 18 (frontend)

**Primary Dependencies**: FastAPI + Pydantic v2; supabase-py (PostgREST) +
psycopg (direct aggregates, R8 pattern); pandas-market-calendars (expected NYSE
sessions — already in use); TanStack Query/Router, Vite, Tailwind

**Storage**: Supabase Postgres — read-only against existing tables (`bars`,
`backfill_jobs`, `runs`, `validation_studies`). No schema changes, no migration.

**Testing**: pytest (pure-logic month derivation + endpoint shapes via the
stub-storage pattern of `tests/api/new/test_configs_endpoints.py`); vitest +
Testing Library (heatmap states, hover, job table, tooltips)

**Target Platform**: existing web app (FastAPI on :8001 / Fly.io; Vite frontend)

**Project Type**: web application (backend + frontend)

**Performance Goals**: SC-005 — new sections render data in <3s on a ~165k-bar
cache. One psycopg GROUP BY over 165k rows is milliseconds; the page makes two
new queries total (stats, jobs).

**Constraints**: read-only feature; sections fail independently (stats error
never blanks the page); existing backfill polling behavior preserved;
month/session bucketing in `America/New_York`.

**Scale/Scope**: ~165k bars / ~2.1k sessions / 9 year-rows × 12 month-cells;
job history capped at 20 (new `api.backfill.history_limit` config knob — no
magic numbers).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Touched? | How this plan complies |
|---|-----------|---------|------------------------|
| I | SPY-Only Instrument (NON-NEGOTIABLE) | no | Read-only views over the existing SPY-only bars cache; no instrument surface added. |
| II | Long-Only, Rule-Based v1 (NON-NEGOTIABLE) | no | No strategy/optimization logic; observability only. |
| III | Risk Manager Has Absolute Veto (NON-NEGOTIABLE) | no | No trading path touched. |
| IV | Test-First Everywhere (NON-NEGOTIABLE) | yes | Every storage/endpoint/UI change is preceded by a failing test: pure month-derivation logic (holiday-vs-gap) unit-tested; endpoints via stub storage; heatmap/job-table/tooltips via vitest. |
| V | Paper-First, Live Disabled (NON-NEGOTIABLE) | no | No mode or broker surface touched. |
| VI | Educational UI | yes | 3 new `?` concepts rendered on the page: `cache_heatmap`, `backfill_job_history`, `data_lineage`; run-viewer HELP_CONTENT exclusion list updated as in 011/012. |
| VII | Journal Everything | no (read path) | Backfill jobs are already recorded; this feature only reads them. No new mutations to journal. |

**Engineering standards check:**

- [x] Timezone: month/session bucketing uses `America/New_York` (same ET
  conversion the existing `bars_present_session_dates` aggregate uses).
- [x] New limit lives in config: `api.backfill.history_limit: 20` in
  `backend/config/config.yaml` (not hardcoded).
- [x] Backend: Python ≥3.11 / FastAPI / Pydantic v2 / pytest.
- [x] Frontend: React + TypeScript + Vite + Tailwind.

No violations → no Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/013-data-observability/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1..D7
├── data-model.md        # Phase 1 — view models (no DB changes)
├── quickstart.md        # Phase 1 — e2e verification script
├── contracts/
│   └── data-observability-api.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── config/config.yaml                          # + api.backfill.history_limit
├── src/intraday_trade_spy/
│   ├── api/
│   │   ├── coverage.py                         # + pure month-stats derivation (expected vs present → states + missing dates)
│   │   ├── routers/bars.py                     # + GET /bars/stats, GET /bars/backfill (list)
│   │   └── schemas.py                          # + BarsStatsResponse, MonthStatView, CacheTotalsView, LineageView, BackfillJobListResponse
│   └── storage/client.py                       # + bars_monthly_aggregate() [psycopg, R8], list_backfill_jobs(), runs_count(), studies_count()
└── tests/
    ├── test_coverage_months.py                 # pure derivation: holiday vs gap, current month, span edges
    └── api/new/test_bars_stats_endpoint.py     # endpoint shapes via stub storage (+ jobs list)

frontend/src/
├── api/bars.ts                                 # + getBarsStats(), listBackfillJobs() + types
├── hooks/useBarsStats.ts, useBackfillJobs.ts   # queries; invalidated on job completion
├── components/
│   ├── data-coverage-panel.tsx                 # page composition: summary → heatmap → regime (unchanged) → backfill + history
│   ├── data/CacheSummary.tsx                   # totals + lineage line
│   ├── data/CacheHeatmap.tsx                   # year×month grid, 4 cell states, hover missing-days
│   ├── data/JobHistoryTable.tsx                # 20 newest jobs, failure reason on hover
│   └── help-content.ts                         # + cache_heatmap, backfill_job_history, data_lineage
└── (tests alongside: CacheHeatmap.test.tsx, JobHistoryTable.test.tsx, data-coverage-panel.test.tsx updates, help-content.test.ts count, run-viewer.test.tsx exclusions)
```

**Structure Decision**: web-app split (backend/ + frontend/) — matches the
existing repository layout; all new code extends existing modules/directories.

## Complexity Tracking

No constitution violations — table intentionally empty.
