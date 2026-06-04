# Tasks: Data Observability — coverage, backfill history & lineage

**Input**: Design documents from `/specs/013-data-observability/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/data-observability-api.md, quickstart.md
**Tests**: REQUIRED — constitution IV (TDD) is non-negotiable: every implementation task is preceded by its failing-test task.

**Organization**: Tasks grouped by user story (US1 job history P1, US2 cache contents P2, US3 holes P3, US4 lineage P4). US1 is the MVP and is fully independent of the stats endpoint. US3 builds on US2's derivation; US4 extends US2's endpoint.

## Phase 1: Setup

- [ ] T001 Add `history_limit: 20` under `api.backfill` in `backend/config/config.yaml` (with comment) and extend `_get_backfill_settings()` (or a sibling `_get_backfill_history_limit()`) in `backend/src/intraday_trade_spy/api/lifecycle.py` to read it with a module DEFAULT — no magic numbers in routers (research D5).

## Phase 2: Foundational (blocking prerequisites)

- [ ] T002 [P] Add backend response schemas to `backend/src/intraday_trade_spy/api/schemas.py`: `CacheTotalsView`, `MonthStatView` (state Literal complete|partial|current|future), `LineageView`, `BarsStatsResponse`, `BackfillJobListResponse` (reusing the existing `BackfillJobView`) — exact shapes per `contracts/data-observability-api.md`.
- [ ] T003 [P] Add frontend types to `frontend/src/api/types.ts`: `CacheTotals`, `MonthStat` (state union), `Lineage`, `BarsStatsResponse`, `BackfillJob`, `BackfillJobListResponse` — mirroring the contract.

**Checkpoint**: schemas/types exist — user stories can proceed.

## Phase 3: User Story 1 — Understand what a backfill did (P1) 🎯 MVP

**Goal**: a job-history table on the Data page; failures stay visible with reasons; live progress + auto-refresh preserved.

**Independent Test**: with stubbed jobs (one failed w/ reason, one finished), the page lists both newest-first with started/range/windows/bars/duration/status; failure reason revealed on hover.

- [ ] T004 [P] [US1] Failing endpoint test: `GET /api/bars/backfill` returns newest-first jobs capped at the config limit, each with created_at/updated_at/status/source/range/windows/bars_added/failure_reason (stub storage, pattern of `tests/api/new/test_configs_endpoints.py`) — in `backend/tests/api/new/test_bars_stats_endpoint.py`.
- [ ] T005 [US1] Implement `list_backfill_jobs(limit)` (PostgREST select, `created_at` desc) in `backend/src/intraday_trade_spy/storage/client.py` + `GET /bars/backfill` (list; reads `history_limit`; does not shadow `GET /bars/backfill/{job_id}`) in `backend/src/intraday_trade_spy/api/routers/bars.py`.
- [ ] T006 [P] [US1] Frontend failing test: `JobHistoryTable` renders rows newest-first with duration (updated−created) and failure reason on hover; running row shows progress — in `frontend/src/components/data/JobHistoryTable.test.tsx`.
- [ ] T007 [US1] Implement `listBackfillJobs()` in `frontend/src/api/bars.ts`, `useBackfillJobs` in `frontend/src/hooks/useBackfillJobs.ts`, and `frontend/src/components/data/JobHistoryTable.tsx`; mount below the backfill controls in `frontend/src/components/data-coverage-panel.tsx`.
- [ ] T008 [US1] Auto-refresh: on a job's transition into finished/failed, `frontend/src/hooks/useBackfillStatus.ts` invalidates the jobs + coverage (+ future stats) query keys (research D7) — with a test in `frontend/src/hooks/useBackfillStatus.test.ts`.
- [ ] T009 [P] [US1] Add `backfill_job_history` to `frontend/src/components/help-content.ts` (why "1 bars added" on a full cache is healthy — dedupe), render the tooltip on the section header, update `help-content.test.ts` count and `frontend/src/routes/run-viewer.test.tsx` exclusion list.

**Checkpoint**: US1 alone is a shippable improvement (the original pain).

## Phase 4: User Story 2 — See what's in the cache (P2)

**Goal**: summary strip (totals/sources/last-updated) + year×month heatmap with 4 cell states.

**Independent Test**: with fixture stats, the strip shows totals and the grid renders complete/current/future cells with a legend.

- [ ] T010 [P] [US2] Failing unit tests for the pure month derivation: state rules (complete/partial/current/future), current month judged only to today (ET), span edges never "missing", zero-bar month inside span = partial — in `backend/tests/test_coverage_months.py`.
- [ ] T011 [US2] Implement `month_stats(...)` pure function (injected expected-sessions provider, style of `regime_coverage`) in `backend/src/intraday_trade_spy/api/coverage.py` (research D3).
- [ ] T012 [P] [US2] Failing endpoint test: `GET /api/bars/stats` returns `{totals, months, lineage}` per contract from stubbed aggregate data; degrades (empty months/null fields), never 500s — in `backend/tests/api/new/test_bars_stats_endpoint.py`.
- [ ] T013 [US2] Implement `bars_monthly_aggregate()` in `backend/src/intraday_trade_spy/storage/client.py` — direct psycopg over `SUPABASE_DB_URL` (R8 pattern of `bars_present_session_dates`): per-ET-month bar_count, distinct session dates, distinct sources, plus totals + `MAX(created_at)` (research D1/D2).
- [ ] T014 [US2] Implement `GET /bars/stats` in `backend/src/intraday_trade_spy/api/routers/bars.py` composing aggregate → `month_stats` → `BarsStatsResponse` (lineage zeros until US4).
- [ ] T015 [P] [US2] Frontend failing tests: `CacheHeatmap` renders the 4 cell states + legend from fixture months; `CacheSummary` renders totals/sources/last-updated; stats-error shows section-scoped message; empty cache keeps existing message — in `frontend/src/components/data/CacheHeatmap.test.tsx`.
- [ ] T016 [US2] Implement `getBarsStats()` in `frontend/src/api/bars.ts`, `useBarsStats` in `frontend/src/hooks/useBarsStats.ts`, `frontend/src/components/data/CacheSummary.tsx`, `frontend/src/components/data/CacheHeatmap.tsx`; compose the page (summary → heatmap → regime table unchanged → backfill + history) in `frontend/src/components/data-coverage-panel.tsx`; add the stats key to T008's invalidation set.
- [ ] T017 [P] [US2] Add `cache_heatmap` to `frontend/src/components/help-content.ts` (state meanings; holidays excluded ⇒ listed missing day is a real gap), render tooltip, update count test + run-viewer exclusions.

## Phase 5: User Story 3 — Spot the holes (P3)

**Goal**: partial cells reveal exact missing trading days; explicit "no missing sessions" when complete.

**Independent Test**: doctor a month (remove one session) → cell turns partial and hover lists exactly that date; a holiday month stays complete.

- [ ] T018 [P] [US3] Failing tests: holiday-vs-gap (removed session listed in `missing_dates`; market holiday never listed) + invariant `missing_dates` non-empty ⇔ state partial — in `backend/tests/test_coverage_months.py`.
- [ ] T019 [US3] Harden `month_stats` missing-dates emission to satisfy T018 (sorted ISO dates; empty for complete/current/future) in `backend/src/intraday_trade_spy/api/coverage.py`.
- [ ] T020 [P] [US3] Frontend failing tests: partial-cell hover/tap lists the exact missing dates; full span renders the explicit "no missing sessions" indication — in `frontend/src/components/data/CacheHeatmap.test.tsx`.
- [ ] T021 [US3] Implement the hover missing-days detail in `frontend/src/components/data/CacheHeatmap.tsx` and the "no missing sessions ✓" line in `frontend/src/components/data/CacheSummary.tsx`.

## Phase 6: User Story 4 — Know what the data feeds (P4)

**Goal**: lineage line "feeds N backtests + M studies · latest <date>" linking to /runs.

**Independent Test**: with stubbed counts, the line renders and links to the Runs page; zero runs degrades to "no backtests yet".

- [ ] T022 [P] [US4] Failing endpoint test: `/bars/stats` lineage carries runs_count/studies_count/latest_run_at from storage stubs — in `backend/tests/api/new/test_bars_stats_endpoint.py`.
- [ ] T023 [US4] Implement `runs_count()`, `studies_count()`, `latest_run_at()` (PostgREST `count="exact"` head queries + 1-row ordered select, precedent in client.py) in `backend/src/intraday_trade_spy/storage/client.py`; wire into `GET /bars/stats` (research D4).
- [ ] T024 [P] [US4] Frontend failing test: lineage line renders counts + latest date + `/runs` link; zero-runs renders "no backtests yet" — extend `frontend/src/components/data/CacheHeatmap.test.tsx` or a `CacheSummary.test.tsx`.
- [ ] T025 [US4] Implement the lineage line in `frontend/src/components/data/CacheSummary.tsx` + add `data_lineage` to `frontend/src/components/help-content.ts`, tooltip rendered, count test + run-viewer exclusions updated.

## Phase 7: Polish & cross-cutting

- [ ] T026 [P] Run `specs/013-data-observability/quickstart.md` end-to-end on the dev stack (incl. verifying the 2026-06-04 failed-alpaca job is visible with its reason; SC-001..SC-007 spot-checks).
- [ ] T027 [P] Docs: update `docs/automated-trading-roadmap.md` feature map (013 = data observability done; study child-runs → 014; insights → 015) + a line in `docs/research-tooling-uplift.md`.
- [ ] T028 Full regression: `PYTHONPATH=. .venv/bin/pytest -q --ignore=tests/api/integration --ignore=tests/test_yfinance_integration.py` (backend) + `npm run typecheck && npx vitest run` (frontend) — all green (3 pre-existing price-chart failures are the known baseline).

## Dependencies

- Setup (T001) + Foundational (T002–T003) → everything.
- **US1 (T004–T009) is independent** — only needs T001/T002/T003.
- US2 (T010–T017) independent of US1 (different endpoint/files) except T016 touches T008's invalidation set (sequence after T008 or merge carefully).
- US3 (T018–T021) extends US2's derivation + heatmap → after US2.
- US4 (T022–T025) extends US2's endpoint + summary → after US2.
- Polish (T026–T028) last.

## Parallel example (US2)

```
# After T011 lands, run in parallel:
T012 (endpoint test)  |  T015 (heatmap tests)  |  T017 (tooltip)
```

## Implementation strategy

MVP-first: ship US1 (job history) alone — it answers the original "what
happened" pain. Then US2 (heatmap) as the second increment, US3/US4 as thin
follow-ons over US2's endpoint. Each checkpoint leaves the page shippable.
