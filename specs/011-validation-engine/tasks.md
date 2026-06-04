---
description: "Task list for Feature 011 — Validation Engine (Phase 2)"
---

# Tasks: Validation Engine (Phase 2 — Validation Methodology)

**Input**: Design documents from `/specs/011-validation-engine/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/validation-api.md, quickstart.md

**Tests**: MANDATORY per constitution IV (Test-First Everywhere, v1.1.0) for every task touching `backend/src/**/*.py` or `frontend/src/**/*.{ts,tsx}`. Each such implementation task is preceded by its failing-test task. Exempt (no gating test): `config.yaml`, SQL migration files, `*.md` docs.

**Organization**: by user story (US1 P1 = MVP). Each story is an independently testable increment.

## Format: `[ID] [P?] [Story] Description with file path`
- **[P]**: parallelizable (different files, no incomplete-task dependency)
- **[Story]**: US1–US4 for story-phase tasks only

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 [P] Add the `validation` block (split dates, walk_forward, sensitivity, significance, max_evaluations_warn) to `backend/config/config.yaml` per data-model §B5 defaults.
- [X] T002 [P] Create the backend package `backend/src/intraday_trade_spy/validation/__init__.py` and the test package `backend/tests/validation/__init__.py`.
- [X] T003 [P] Author migration `backend/db/migrations/0110_validation_studies.sql` (table + CHECKs + `(user_id, created_at DESC)` index + owner RLS) per data-model §A1.
- [X] T004 [P] Author migration `backend/db/migrations/0111_runs_study_columns.sql` (ADD nullable `study_id` FK / `segment` CHECK / `window_index` + partial index) per data-model §A2.
- [X] T005 ~Author migration 0113 (push_run RPC passthrough)~ — N/A: confirmed UNNEEDED. study_id/segment/window_index are set at insert_queued_run (direct insert); push_run_finalize preserves un-named columns, so no RPC change is required.
- [X] T006 Apply migrations 0110, 0111, 0113 to Supabase via direct psycopg + `SUPABASE_DB_URL` (sandbox: use `dangerouslyDisableSandbox` if blocked); verify columns/tables exist.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: blocks ALL user stories. Delivers the config, the behavior-neutral engine refactor, the split discipline, study persistence, and the study orchestrator + background task.

### Config

- [X] T007 [P] Failing test: `ValidationConfig` + sub-models parse the `validation` block (defaults + overrides, date coercion) in `backend/tests/validation/test_config_validation.py`.
- [X] T008 Implement `ValidationConfig`/`SplitConfig`/`WalkForwardConfig`/`SensitivityConfig`/`SignificanceConfig` in `backend/src/intraday_trade_spy/config.py` and wire `validation` into `Config` + `load_config`.

### Engine refactor (FR-024 — behavior-neutral)

- [X] T009 Failing test: `run_df(df, range_start, range_end)` ↔ `run(csv_path)` produce byte-identical `SummaryMetrics`+journal, AND a sub-range slice of a multi-month frame matches a standalone `run` over that sub-range's CSV (no cross-window VWAP/OR bleed) in `backend/tests/validation/test_engine_run_df.py`.
- [X] T010 Extract `BacktestEngine.run_df(self, df, *, range_start, range_end)` in `backend/src/intraday_trade_spy/backtest/engine.py`; make `run(csv_path, output_dir)` delegate to it.

### Split discipline + lockbox guard (FR-001..003)

- [X] T011 [P] Failing test: `segments(cfg)` returns train/validation/lockbox; `assert_no_lockbox_overlap(start, end, segments)` raises on lockbox intersection in `backend/tests/validation/test_split.py`.
- [X] T012 Implement `backend/src/intraday_trade_spy/validation/split.py` (`segments`, `assert_no_lockbox_overlap`).

### Storage & cloud models

- [X] T013 [P] Failing test: `ValidationStudyRow` / `LockboxLedgerRow` models + `RunRow` study fields validate/serialize in `backend/tests/storage/test_models_payload.py`.
- [X] T014 Add `ValidationStudyRow`, `LockboxLedgerRow` and `study_id`/`segment`/`window_index` to `RunRow` in `backend/src/intraday_trade_spy/storage/models.py`.
- [X] T015 Failing test: study CRUD (`create_study`, `get_study`, `list_studies`, `update_study_progress`, `finalize_study`), `list_runs_by_study`, and `insert_queued_run` carrying study tags in `backend/tests/storage/test_client_studies.py`.
- [X] T016 Implement study CRUD + study-tag threading (insert_queued_run / push payload) in `backend/src/intraday_trade_spy/storage/client.py`.

### Study orchestrator + background task (FR-004..006)

- [X] T017 Failing test: orchestrator loads bars once, runs N evaluations via `run_df`, persists tagged child runs, updates progress, and links a dedup-hit finished run instead of recomputing (SC-008) in `backend/tests/validation/test_study_orchestrator.py`.
- [X] T018 Implement `backend/src/intraday_trade_spy/validation/study.py` (load-once/slice, `run_evaluation(config, range, segment, window_index)` → child run + dedup link, progress updates).
- [X] T019 Failing test: `run_study_task` lifecycle (queued→running→finished and →failed with partial children intact) + stale-`running`-study sweep in `backend/tests/api/test_validation_lifecycle.py`.
- [X] T020 Implement `backend/src/intraday_trade_spy/api/validation_lifecycle.py` and extend the startup `sweep_stale_runs()` hook to also fail stale studies.

### API + frontend shell

- [X] T021 Failing test: validation router mounts; `GET /api/validation/studies`, `/{id}`, `/{id}/status` are owner-scoped (404 cross-user) in `backend/tests/api/test_validation_api.py`.
- [X] T022 Implement `backend/src/intraday_trade_spy/api/routers/validation.py` (list/get/status) + `ValidationStudyView`/`ValidationStudyStatusView`/`StartStudyResponse` in `api/schemas.py`; mount in `api/app.py`.
- [X] T023 [P] Failing test: Validation route shell renders + nav entry present in `frontend/src/routes/_authenticated.validation.test.tsx`.
- [X] T024 Implement the Validation route shell `frontend/src/routes/_authenticated.validation.tsx` + study-detail route `frontend/src/routes/_authenticated.validation_.$studyId.tsx` (empty panels), nav entry in the authenticated shell, `frontend/src/api/validation.ts` client + `useStudies`/`useStudy`/`useStudyStatus` hooks + base types in `frontend/src/api/types.ts`.

**Checkpoint**: foundation ready — user stories can begin.

---

## Phase 3: User Story 1 — Walk-forward IS-vs-OOS (Priority: P1) 🎯 MVP

**Goal**: launch a walk-forward study and see per-window in-sample vs out-of-sample metrics with the gap flagged; lockbox never touched.

**Independent Test**: launch a WF study on `default`/`train_validation`; confirm ~11 windows with IS-vs-OOS + gap, and zero lockbox-dated bars evaluated (SC-001, SC-002).

- [X] T025 [P] [US1] Failing test: window enumeration (rolling + anchored) boundaries vs hand-computed values, and no enumerated window overlaps lockbox, in `backend/tests/validation/test_window.py`.
- [X] T026 [US1] Implement `backend/src/intraday_trade_spy/validation/window.py` (rolling/anchored enumeration from `WalkForwardConfig`).
- [X] T027 [P] [US1] Failing test: `WindowMetrics`/`WalkForwardWindowResult`/`WalkForwardResult` models in `backend/tests/test_models.py`.
- [X] T028 [US1] Add those models to `backend/src/intraday_trade_spy/models.py` (per data-model §B1).
- [X] T029 [US1] Failing test: `walk_forward` builds per-window IS/OOS `WindowMetrics`, gap (OOS−IS), and `mean_oos`/`mean_gap`; never evaluates lockbox, in `backend/tests/validation/test_walk_forward.py`.
- [X] T030 [US1] Implement `backend/src/intraday_trade_spy/validation/walk_forward.py` (uses study core + window + split guard).
- [X] T031 [US1] Failing test: `POST /api/validation/studies kind=walk_forward` returns `planned_evaluations`, enforces `large_study`/`confirm_large`, and rejects lockbox-overlap, in `backend/tests/api/test_validation_api.py`.
- [X] T032 [US1] Implement the walk_forward launch path in `api/routers/validation.py` + `StartStudyRequest` (walk_forward params) in `api/schemas.py`; wire orchestrator via `validation_lifecycle`.
- [X] T033 [P] [US1] Failing test: `walk-forward-table` renders IS/OOS columns + color-coded gap + low-confidence flag in `frontend/src/components/validation/walk-forward-table.test.tsx`.
- [X] T034 [US1] Implement `frontend/src/components/validation/walk-forward-table.tsx` + `start-study-dialog.tsx` (WF mode) + mount in the study-detail route + `useStartStudy` hook + WF result types.
- [X] T035 [P] [US1] Add `HELP_CONTENT` keys `walk_forward`, `in_sample`, `out_of_sample`, `is_oos_gap` + `HelpTooltip`s; test in `frontend/src/components/validation/walk-forward-table.test.tsx`.

**Checkpoint**: US1 fully functional and independently testable (MVP).

---

## Phase 4: User Story 2 — Parameter sensitivity (Priority: P2)

**Goal**: run a human-specified knob grid and read a plateau-vs-spike surface.

**Independent Test**: launch a 2-D sensitivity study; confirm the heatmap renders the metric per grid point and the large-grid guard trips without `confirm_large` (SC-003).

- [X] T036 [P] [US2] Failing test: grid enumeration (1-D/2-D Cartesian, ≥3-D rejected, empty values rejected) + planned-count in `backend/tests/validation/test_sweep.py`.
- [X] T037 [US2] Implement `backend/src/intraday_trade_spy/validation/sweep.py` (grid → per-point evaluations over a segment; dotted-knob override).
- [X] T038 [P] [US2] Failing test: `SensitivityPoint`/`SensitivitySurface` models in `backend/tests/test_models.py`.
- [X] T039 [US2] Add `SensitivityPoint`/`SensitivitySurface` to `backend/src/intraday_trade_spy/models.py` (per data-model §B2).
- [X] T040 [US2] Failing test: `POST /api/validation/studies kind=sensitivity` (grid + metric, `confirm_large` over threshold, ≥3-D 422) in `backend/tests/api/test_validation_api.py`.
- [X] T041 [US2] Implement the sensitivity launch path in `api/routers/validation.py` + `grid`/`metric` request fields; wire orchestrator.
- [X] T042 [P] [US2] Failing test: `sensitivity-surface` heatmap (color scale, 1-D row + 2-D grid, low-confidence cells marked, legend) in `frontend/src/components/validation/sensitivity-surface.test.tsx`.
- [X] T043 [US2] Implement `frontend/src/components/validation/sensitivity-surface.tsx` (dependency-free SVG/CSS) + sensitivity mode in `start-study-dialog.tsx` + mount in study-detail.
- [X] T044 [P] [US2] Add `HELP_CONTENT` keys `parameter_sensitivity`, `plateau_vs_peak` to `frontend/src/components/help-content.ts` + `HelpTooltip`s in `sensitivity-surface.tsx`; assert in its test.

**Checkpoint**: US1 + US2 both independently functional.

---

## Phase 5: User Story 3 — Significance (Priority: P2)

**Goal**: bootstrap CI + random-entry permutation p-value + "significant at α=0.05?" verdict on a result, reproducible by seed.

**Independent Test**: `POST /api/validation/significance` for a run_id returns CI + p-value + verdict; same seed → identical output; 0/1-trade run → undefined verdict, not an error (SC-004).

- [X] T045 [P] [US3] Failing test: seeded bootstrap CI determinism (expectancy_$/R, Sharpe) + degenerate 0/1-trade handling in `backend/tests/validation/test_significance.py`.
- [X] T046 [US3] Implement bootstrap CI in `backend/src/intraday_trade_spy/validation/significance.py` (`numpy.random.default_rng(seed)`, percentile CI) + `BootstrapCI`/`SignificanceResult` models in `models.py`.
- [X] T047 [P] [US3] Failing test: random-entry null respects clock (no entry after `no_new_trades_after`, no overlap with open position, no overnight) + seeded determinism in `backend/tests/validation/test_random_entry.py`.
- [X] T048 [US3] Implement `backend/src/intraday_trade_spy/validation/random_entry.py` (sample eligible entry bars; reuse `PaperBroker` exit/costs to resolve each synthetic trade).
- [X] T049 [US3] Failing test: permutation p-value + verdict (`p < alpha`) + full reproducibility in `backend/tests/validation/test_significance.py`.
- [X] T050 [US3] Implement the permutation test + verdict in `validation/significance.py`.
- [X] T051 [US3] Failing test: `POST /api/validation/significance` (run_id, determinism, 0-trade label, overrides) in `backend/tests/api/test_validation_api.py`.
- [X] T052 [US3] Implement the significance endpoint in `api/routers/validation.py` + `SignificanceRequest`/`SignificanceResult` schemas (loads the run's trades).
- [X] T053 [P] [US3] Failing test: `significance-panel` (CI bar, p-value, verdict badge, undefined-when-thin) in `frontend/src/components/validation/significance-panel.test.tsx`.
- [X] T054 [US3] Implement `frontend/src/components/validation/significance-panel.tsx` + `useSignificance` hook + mount in study-detail / run-detail.
- [X] T055 [P] [US3] Add `HELP_CONTENT` keys `bootstrap_ci`, `permutation_test` to `frontend/src/components/help-content.ts` + `HelpTooltip`s in `significance-panel.tsx`; assert in its test.

**Checkpoint**: US1–US3 independently functional.

---

## Phase 6: User Story 4 — One-shot lockbox gate (Priority: P3)

**Goal**: freeze a config, run the lockbox once (recorded immutably); block a different config (409) with a deliberate, journaled override-burn.

**Independent Test**: first run → spent + journaled; same config → idempotent; different config → 409; `override:true` → burned + warn journal, original never overwritten (SC-005).

- [X] T056 [P] [US4] Author migration `backend/db/migrations/0112_lockbox_ledger.sql` (append-only table + CHECKs + index + owner RLS, no UPDATE/DELETE policy) per data-model §A3; apply via psycopg.
- [X] T057 [US4] Failing test: ledger append + `get_lockbox_status` (latest-row state derivation: unspent→spent→burned) + RLS in `backend/tests/storage/test_client_lockbox.py`.
- [X] T058 [US4] Implement ledger storage (`append_lockbox_row`, `get_lockbox_status`) in `backend/src/intraday_trade_spy/storage/client.py`.
- [X] T059 [P] [US4] Failing test: freeze-fingerprint determinism (`compute_spec_hash` over config+lockbox range) + the full state machine (spend / idempotent same-fingerprint / block different-fingerprint / override-burn) + result immutability in `backend/tests/validation/test_lockbox.py`.
- [X] T060 [US4] Implement `backend/src/intraday_trade_spy/validation/lockbox.py` (freeze fingerprint + state machine + `LockboxStatus` model + journal `lockbox_spent`/`lockbox_burned` events).
- [X] T061 [US4] Failing test: `GET /api/validation/lockbox` + `POST /api/validation/lockbox/run` (spent, idempotent, 409 block, override→burned) in `backend/tests/api/test_validation_api.py`.
- [X] T062 [US4] Implement the lockbox endpoints in `api/routers/validation.py` + `LockboxRunRequest`/`LockboxRunResponse`/`LockboxStatusView` schemas (runs the one-shot eval via `run_evaluation`, segment=`lockbox`).
- [X] T063 [P] [US4] Failing test: `lockbox-gate` (unspent/spent/burned states, override confirm dialog, contaminated banner) in `frontend/src/components/validation/lockbox-gate.test.tsx`.
- [X] T064 [US4] Implement `frontend/src/components/validation/lockbox-gate.tsx` + `useLockboxStatus`/`useLockboxRun` hooks + mount in study-detail/Validation route + types.
- [X] T065 [P] [US4] Add `HELP_CONTENT` keys `lockbox`, `burned_lockbox` to `frontend/src/components/help-content.ts` + `HelpTooltip`s in `lockbox-gate.tsx`; assert in its test.

**Checkpoint**: all four stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T066 [P] Principle-II/V guard test: assert no `validation/` code path imports or calls a broker live-order path (`live_auto_enabled` unreachable from validation) in `backend/tests/validation/test_no_live_path.py`.
- [X] T067 Decide and set the `walk_forward.overfit_gap_warn` default threshold in `backend/config/config.yaml` + surface it as the WF table's "overfit" highlight rule (the one knob deferred from plan; add a test for the highlight rule in `walk-forward-table.test.tsx`).
- [X] T068 [P] Run `quickstart.md` end-to-end against live Supabase (WF → sensitivity → significance → lockbox); record outcomes.
- [X] T069 [P] Determinism sweep: re-run a study + significance with the same seed; assert byte-identical verdicts (SC-004) in `backend/tests/validation/test_determinism.py`.
- [X] T070 [P] Update `docs/automated-trading-roadmap.md` Phase 2 status + the feature↔phase map (011 status) and add an `EXPERIMENTS.md` note that the methodology is live.
- [X] T071 Performance check: a default WF study (~11 windows) + a ~12-point sensitivity grid complete within the low-single-digit-minute target; record timings.

---

## Dependencies & Execution Order

- **Setup (Ph1)** → **Foundational (Ph2)** blocks all stories.
- Within Foundational: T007→T008 (config); T009→T010 (engine); T011→T012 (split); T013→T014, T015→T016 (storage); T017→T018, T019→T020 (orchestrator/lifecycle); T021→T022, T023→T024 (API/UI shell). Engine (T010), split (T012), storage (T016), orchestrator (T018) are all required before US1.
- **US1 (P1)** depends only on Foundational → **MVP**.
- **US2 (P2)** depends on Foundational (reuses orchestrator); independent of US1.
- **US3 (P2)** depends on Foundational (uses `run_df` + a run's trades); independent of US1/US2 (significance endpoint is synchronous, not a study).
- **US4 (P3)** depends on Foundational (`run_evaluation`, split) + its own ledger migration (T056); independent of US1–US3.
- **Polish (Ph7)** after the stories you intend to ship.

### Within each story
Failing test → model → service/module → endpoint → UI. Verify each test fails before implementing.

### Parallel opportunities
- Setup T001–T005 all [P].
- Foundational: the three test-authoring tasks T007/T011/T013 are [P]; T009 (engine test) is [P] with them. Storage vs orchestrator vs API tracks can progress in parallel once their tests are written.
- Across stories: once Foundational is done, US1/US2/US3/US4 can be staffed in parallel (distinct files); within a story, [P] tasks are different files.

---

## Parallel Example: User Story 1

```bash
# Author failing tests together:
Task: "T025 window enumeration test in backend/tests/validation/test_window.py"
Task: "T027 WF result models test in backend/tests/test_models.py"
Task: "T033 walk-forward-table component test in frontend/src/components/validation/walk-forward-table.test.tsx"
```

---

## Implementation Strategy

**MVP = Setup + Foundational + US1 (walk-forward).** Stop and validate: a WF study shows IS-vs-OOS with the gap, provably never touching the lockbox. That alone is the core overfit detector and a shippable increment.

**Incremental delivery:** US1 → US2 (sensitivity) → US3 (significance) → US4 (lockbox). Each adds value without breaking the prior. The full exit-gate loop (SC-007) is live only after US4, but each story is independently demoable.

---

## Notes
- [P] = different files, no incomplete-task dependency. [Story] maps to spec user stories.
- Every `backend/src`/`frontend/src` implementation task is preceded by its failing test (constitution IV). `config.yaml` and SQL migrations are exempt.
- Migrations 0110/0111/0113 in Setup; 0112 (lockbox ledger) in US4.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
