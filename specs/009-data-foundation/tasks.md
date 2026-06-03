---
description: "Task list for Feature 009 — Phase 0 Data Foundation"
---

# Tasks: Phase 0 — Data Foundation (Multi-Regime Historical Bars)

**Input**: Design documents from `/specs/009-data-foundation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: MANDATORY per constitution IV (Test-First Everywhere). Every task touching `backend/src/**/*.py`, `frontend/src/**/*.{ts,tsx}`, or non-trivial `backend/scripts/**` is preceded by a failing-test task. Exempt (no gated test): `config.yaml`/`pyproject.toml`/`.env.example` (config), `db/migrations/*.sql` (DDL), `*.md` (docs).

**Organization**: grouped by user story (US1 P1 → US2 P2 → US3 P3) for independent implementation/testing.

## Format: `[ID] [P?] [Story] Description with file path`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (story phases only)

## Path conventions

Web app: `backend/src/intraday_trade_spy/…`, `backend/tests/…`, `frontend/src/…`. Src package = `intraday_trade_spy`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependencies, config, secrets scaffolding. (All config — TDD-exempt.)

- [x] T001 [P] Add `alpaca-py` and `pandas-market-calendars` to `backend/pyproject.toml` dependencies; lock/install in `.venv`.
- [x] T002 [P] Add `ALPACA_API_KEY`, `ALPACA_SECRET_KEY`, `ALPACA_PAPER` placeholder entries to `backend/.env.example` (real keys already in gitignored `backend/.env`).
- [x] T003 [P] Add to `backend/config/config.yaml`: `data.source_preference: [alpaca, yfinance]`, `data.regime_covered_threshold_pct: 90`, `data.regimes` (2020 vol / 2021 bull / 2022 bear / 2023–24 chop-trend with start/end), `api.backfill.{window_days: 30, max_concurrent_per_user: 1, stale_job_ttl_minutes: 60}`, `alpaca.feed: iex`. *(C1: `stale_job_ttl_minutes` bounds the stuck-job cap.)*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: config models, the bar-source seam, and DB schema that ALL stories depend on.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [x] T004 [P] Write failing tests for new config models (parse `data.source_preference`, `data.regime_covered_threshold_pct`, `data.regimes`→`RegimeWindow`, new `AlpacaConfig.feed`; SPY-only unaffected) in `backend/tests/test_config_data_foundation.py`.
- [x] T005 Implement config models in `backend/src/intraday_trade_spy/config.py`: add `RegimeWindow`, extend `DataConfig` (`source_preference`, `regime_covered_threshold_pct`, `regimes`), add `AlpacaConfig`, wire into `Config`. (depends T004)
- [x] T006 [P] Write failing tests for the bar-source seam: `BarSource` Protocol conformance, `BarRow` normalized shape, `YfinanceBarSource` adapter returns rows identical to today's `_parse_csv` output, `symbol != "SPY"` raises, in `backend/tests/data/test_bar_source.py`.
- [x] T007 Implement `backend/src/intraday_trade_spy/data/bar_source.py`: `BarSource` Protocol, `BarRow` type, `YfinanceBarSource` adapter wrapping the existing `Downloader`; enforce SPY-only. (depends T006)
- [x] T008 [P] Write migration `backend/db/migrations/0093_bars_bar_start_index.sql` — `CREATE INDEX IF NOT EXISTS bars_bar_start_idx ON public.bars (bar_start);` (DDL — exempt).
- [x] T009 [P] Write migration `backend/db/migrations/0094_backfill_jobs.sql` — `backfill_jobs` table (per data-model.md) + RLS (authenticated read own, service-role all), mirroring `0013_rls_policies_bars.sql` (DDL — exempt).
- [x] T010 Apply migrations `0093` and `0094` manually in the Supabase SQL editor; verify the index and `backfill_jobs` table exist (manual op — project practice).

**Checkpoint**: config drives source preference/regimes/threshold; bar-source seam exists; schema ready.

---

## Phase 3: User Story 1 — Multi-year historical bars for a meaningful backtest (Priority: P1) 🎯 MVP

**Goal**: load years of SPY 5-min history from Alpaca via an in-app background backfill with progress; a full-span backtest yields hundreds+ trades and reads fast (via the `bar_start` index).

**Independent Test**: backfill an (Alpaca-only) cache over a multi-year span; confirm the job reaches `finished` with progress; run a default backtest over the full span → several hundred+ trades in seconds.

### Tests for User Story 1 (write first, must FAIL)

- [x] T011 [P] [US1] Failing tests for `AlpacaBarSource.fetch_rows` with an **injected/mocked** Alpaca data client (mirror `Downloader(download_fn=...)`): multi-year window beyond 730 days, 5-min IEX bars, ET regular-session filter, normalized rows with `source="alpaca"`, `symbol!="SPY"` raises — `backend/tests/data/test_alpaca_source.py`.
- [x] T012 [P] [US1] Failing tests for `backfill_jobs` storage methods (insert/update/get/count_active) against a stubbed supabase client; **C1: `count_active_backfills` excludes stale `running` jobs older than `api.backfill.stale_job_ttl_minutes`** — `backend/tests/storage/test_backfill_jobs.py`.
- [x] T013 [P] [US1] Failing contract tests `POST /api/bars/backfill` (202 happy; 400 `end_before_start`; 400 `future_date`; 409 `backfill_in_progress`) and `GET /api/bars/backfill/{job_id}` (200 progress; 404 `job_not_found`) using `unit_client` + `stub_storage_client` — `backend/tests/api/new/test_backfill_endpoints.py`.
- [x] T014 [P] [US1] Failing tests for the backfill runner: loops windows updating `windows_done/bars_added/gap_session_dates`; idempotent (a window whose `upsert_bars` returns 0 leaves `bars_added` unchanged); terminal `finished`/`failed`; **Principle V guard — asserts the data path constructs only Alpaca's historical-data client, never a trading/order client** — `backend/tests/api/test_backfill_runner.py`.
- [x] T015 [P] [US1] Failing frontend tests: `useStartBackfill` mutation + `useBackfillStatus` polling hooks; backfill trigger renders range inputs + start button and calls the API — `frontend/src/hooks/useStartBackfill.test.ts`, `frontend/src/hooks/useBackfillStatus.test.ts`, component test.

### Implementation for User Story 1

- [x] T016 [US1] Implement `AlpacaBarSource` in `backend/src/intraday_trade_spy/data/alpaca_source.py` (alpaca-py `StockHistoricalDataClient`, IEX feed, RAW adjustment, env-keyed, injectable client; reuse shared ET session filter per R10). (depends T011, T007)
- [x] T017 [US1] Implement `backfill_jobs` storage methods in `backend/src/intraday_trade_spy/storage/client.py`: `insert_backfill_job`, `update_backfill_job`, `get_backfill_job`, `count_active_backfills` (**C1: count only non-terminal jobs whose `updated_at` is within `stale_job_ttl_minutes`**). (depends T012)
- [x] T018 [US1] Implement backfill orchestration in `backend/src/intraday_trade_spy/api/lifecycle.py`: `start_backfill` (cap check via `count_active_backfills`, insert `queued` job, enqueue `BackgroundTasks`) and `_run_backfill_task` (window loop using `iter_windows`-style splitting at `api.backfill.window_days`, `upsert_bars` chunks, progress writes, gap capture, terminal status). (depends T016, T017)
- [x] T019 [US1] Implement endpoints `POST /api/bars/backfill` and `GET /api/bars/backfill/{job_id}` in `backend/src/intraday_trade_spy/api/routers/bars.py` per `contracts/backfill.md`. (depends T018, T013)
- [x] T020 [P] [US1] Frontend API client `startBackfill` + `getBackfillStatus` in `frontend/src/api/bars.ts`. (depends T013 contract)
- [x] T021 [US1] Frontend hooks `useStartBackfill` (useMutation) + `useBackfillStatus` (polling useQuery until terminal) in `frontend/src/hooks/`. (depends T020, T015)
- [x] T022 [US1] Frontend backfill trigger control (range inputs, start button, live progress `windows_done/total` + `bars_added`) in `frontend/src/components/` (rendered by the coverage panel built in US3, or standalone). (depends T021)

**Checkpoint**: in-app multi-year backfill works with progress; full-span backtest yields hundreds+ trades in seconds (index from T010).

---

## Phase 4: User Story 2 — Trustworthy data: one clean bar per timestamp, idempotent, validated (Priority: P2)

**Goal**: the backtest read path delivers exactly one bar per timestamp across sources (prefer Alpaca); bars are validated; re-runs are idempotent; the audit record is reviewable.

**Independent Test**: cache an overlapping range from both sources → a backtest sees exactly one bar per 5-min timestamp (Alpaca); re-run backfill → ~0 bars added; feed an OHLC-insane/out-of-session bar → rejected and counted, not stored.

### Tests for User Story 2 (write first, must FAIL)

- [x] T023 [P] [US2] Failing tests: `list_bars` returns `source`; `materialize_bars_csv` dedups overlapping `bar_start` keeping the highest `data.source_preference` source (alpaca>yfinance) → exactly one bar per timestamp — `backend/tests/api/test_materialize_dedup.py`.
- [x] T024 [P] [US2] Failing tests for shared bar validation: reject non-positive prices, `high<low`, `high<max(open,close)`/`low>min(open,close)`, out-of-session timestamps; rejects are counted, not stored — `backend/tests/data/test_bar_validation.py`.
- [x] T025 [P] [US2] Failing integration tests: backfill re-run over a cached range adds 0 bars; a two-source overlap fixture yields exactly one engine-visible bar per timestamp — `backend/tests/api/test_backfill_idempotency.py`.

### Implementation for User Story 2

- [x] T026 [US2] Add `source` to the `list_bars` select in `backend/src/intraday_trade_spy/storage/client.py`. (depends T023)
- [x] T027 [US2] Implement cross-source dedup in `materialize_bars_csv` (`backend/src/intraday_trade_spy/api/lifecycle.py`): group rows by `bar_start`, keep the row whose `source` ranks first in `data.source_preference`; stable order. (depends T026)
- [x] T028 [US2] Implement the shared OHLC+session validator (used by `AlpacaBarSource`, reused by the yfinance path) in `backend/src/intraday_trade_spy/data/` and surface reject counts into the job's gap/summary. (depends T024, T016)

**Checkpoint**: overlap fixture → one bar (Alpaca); re-run idempotent; invalid bars rejected+counted.

---

## Phase 5: User Story 3 — Visible, educational data coverage (Priority: P3)

**Goal**: an in-app coverage panel shows the cached span + per-regime % completeness with a covered/gap indicator at the 90% bar, each new concept carrying a `?` HelpTooltip.

**Independent Test**: with data cached, open the Data page → span + a row per regime with % completeness and covered/gap flag; a `<90%` regime shows as a gap; each concept has a working `?` tooltip.

### Tests for User Story 3 (write first, must FAIL)

- [x] T029 [P] [US3] Failing tests for coverage-by-regime: expected-session count via NYSE calendar; present distinct ET session-days via the psycopg aggregate; `covered = pct ≥ threshold` (boundary 90% → covered); empty cache → all `covered:false, pct:0`; `expected==0` → no divide-by-zero — `backend/tests/storage/test_coverage_by_regime.py` + extend `backend/tests/api/new/test_bars_endpoints.py`.
- [x] T030 [P] [US3] Failing frontend tests: `DataCoveragePanel` renders span + a row per regime (% + covered/gap flag); a `<90%` regime is flagged as a gap; each concept (coverage, regime completeness, backfill, data source) renders a `HelpTooltip` — `frontend/src/components/data-coverage-panel.test.tsx`.

### Implementation for User Story 3

- [x] T031 [US3] Implement the NYSE expected-session calendar util (pandas-market-calendars `XNYS`) in `backend/src/intraday_trade_spy/calendar/` (or `data/`); future-dated portions count only to today. (depends T029)
- [x] T032 [US3] Implement storage coverage-by-regime in `backend/src/intraday_trade_spy/storage/client.py`: psycopg aggregate of distinct present ET session-days per window via `SUPABASE_DB_URL`. (depends T029)
- [x] T033 [US3] Extend `GET /api/bars/coverage` in `backend/src/intraday_trade_spy/api/routers/bars.py` to return `regimes[]` with `expected_sessions/present_sessions/completeness_pct/covered` per `contracts/coverage.md` (keep `earliest`/`latest` backward-compatible). (depends T031, T032)
- [x] T034 [P] [US3] Update `BarsCoverageResponse` type + `getBarsCoverage` in `frontend/src/api/bars.ts` and `useBarsCoverage` in `frontend/src/hooks/useBarsCoverage.ts` for the new shape. (depends T033 contract)
- [x] T035 [US3] Implement `frontend/src/components/data-coverage-panel.tsx`: cached span + per-regime rows (% + covered/gap), hosting the US1 backfill trigger. (depends T034)
- [x] T036 [P] [US3] Add HelpTooltip content keys (data coverage, regime completeness, backfill, data source) in `frontend/src/components/help-content.ts` and wire `<HelpTooltip>` into the panel (constitution VI). (depends T035)
- [x] T037 [US3] Add a Data route `frontend/src/routes/_authenticated.data.tsx` hosting `DataCoveragePanel` (and link it in nav). (depends T035)

**Checkpoint**: operators can see span + regime coverage with education; all three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T038 [P] **IEX-vs-consolidated VWAP discrepancy check** — **resolved by going straight to Alpaca SIP** (Algo Trader Plus). The backfill used `feed: sip` (consolidated, all US exchanges), so research R6's IEX volume-fidelity concern doesn't apply: VWAP is computed on consolidated data matching live. No IEX data was cached to compare against, so the discrepancy check is moot.
- [x] T042 Fix `list_bars` 1000-row PostgREST cap (discovered during T040): multi-year reads were silently truncated to 1000 bars. Now uses a single psycopg query (uncapped, ~3s for 168k rows) with a paginated PostgREST fallback. `backend/src/intraday_trade_spy/storage/client.py` + tests in `tests/api/test_materialize_dedup.py`.
- [x] T039 [P] Update `docs/automated-trading-roadmap.md` feature table (009 status) and note the manual migrations applied.
- [x] T040 Run `quickstart.md` end-to-end to verify the **exit gate**: ≥2–3 yr cached, all four regimes `covered`, full-span default backtest yields hundreds+ trades in seconds.
- [x] T041 [P] *(Optional, per clarify)* CLI `backend/scripts/backfill_bars.py` sharing the backfill core (mirror `seed_bars_from_csv.py`); if it carries logic, precede with a failing test in `backend/tests/`.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)**: no deps — start immediately.
- **Foundational (P2)**: after Setup — **BLOCKS all stories**. (T005←T004, T007←T006, T010←T008+T009.)
- **US1 (P3)**: after Foundational. MVP.
- **US2 (P4)**: after Foundational; builds on US1's runner/source (dedup hardens US1's correctness). Independently testable.
- **US3 (P5)**: after Foundational; reads config regimes + cache. Independently testable.
- **Polish (P6)**: after the stories you intend to ship.

### Within each story

Tests (FAIL first) → models/sources → storage → orchestration/endpoints → frontend. Specific edges noted per task (`depends …`).

### Parallel opportunities

- Setup T001–T003 all [P].
- Foundational: T004 [P] / T006 [P] / T008 [P] / T009 [P] (different files); impl T005/T007 follow their tests; T010 after T008+T009.
- US1 tests T011–T015 all [P]; then T016/T017 in parallel, T018 after both, T019 after T018, T020 [P], T021 after T020.
- US2 tests T023–T025 [P]; US3 tests T029–T030 [P].
- With capacity, US1/US2/US3 can proceed in parallel after Foundational.

---

## Parallel Example: User Story 1

```bash
# Launch all US1 tests together (write first, ensure they FAIL):
Task: "AlpacaBarSource tests in backend/tests/data/test_alpaca_source.py"
Task: "backfill_jobs storage tests in backend/tests/storage/test_backfill_jobs.py"
Task: "backfill endpoint contract tests in backend/tests/api/new/test_backfill_endpoints.py"
Task: "backfill runner + Principle-V guard tests in backend/tests/api/test_backfill_runner.py"
Task: "frontend backfill hook/component tests"

# Then parallel implementation where files don't overlap:
Task: "Implement AlpacaBarSource (data/alpaca_source.py)"
Task: "Implement backfill_jobs storage methods (storage/client.py)"
```

---

## Implementation Strategy

### MVP first (User Story 1)

1. Setup (P1) → 2. Foundational (P2) → 3. US1 (P3) → **STOP & VALIDATE**: backfill multi-year, full-span backtest yields hundreds+ trades. This alone clears the phase's headline blocker.

### Incremental delivery

US1 (MVP: have the data) → US2 (trust the data: dedup/validate/idempotent) → US3 (see the data: coverage + education) → Polish (VWAP honesty check + exit-gate run).

---

## Notes

- TDD is gated (constitution IV): the failing test precedes its implementation for every `src/` task.
- **Principle V** is explicitly guarded by T014 (no trading client on the data path).
- DDL (`0093`, `0094`) is applied **manually** in Supabase — T010 is a human step.
- `[P]` = different files, no incomplete dependency. Commit after each task or logical group.
- US1's independent test runs on an Alpaca-only cache; US2 then hardens correctness on source overlap.
