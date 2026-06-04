# Tasks: Study Child-Run Persistence + Drill-Down

**Input**: Design documents from `/specs/014-study-run-persistence/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: MANDATORY (constitution IV, Test-First Everywhere v1.1.0) — every
task touching `backend/src/**/*.py` or `frontend/src/**/*.{ts,tsx}` is preceded
by its failing-test task. Backend offline suite:
`cd backend && PYTHONPATH=. .venv/bin/pytest -q --ignore=tests/api/integration
--ignore=tests/test_yfinance_integration.py`. Frontend: `npx vitest run`
(3 `price-chart.test.tsx` failures are pre-existing baseline, not regressions).

**Organization**: grouped by user story (US1 P1, US2 P2, US3 P3, US4 P3) so
each story is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

**Purpose**: Pin the green baseline before any change.

- [ ] T001 Run both offline suites and record the baseline (backend all-pass; frontend all-pass except the 3 known `frontend/src/components/price-chart.test.tsx` failures) — no file changes

---

## Phase 2: Foundational (Blocking Prerequisites)

**None.** Zero migrations — `runs.study_id/segment/window_index` (0111),
`lockbox_ledger.run_id` (0112), `runs.spec_hash` (0091), and
`runs.config_snapshot` (0092) already exist; no new packages; no config keys.
User stories can begin immediately after T001.

---

## Phase 3: User Story 1 — Drill into a study's evaluations (P1) 🎯 MVP

**Goal**: every study evaluation persisted as a real run (tagged, deduped,
fail-soft); lockbox child + ledger link; child runs expose study membership and
badge back to their study.

**Independent Test**: run a small walk-forward study → each window's IS/OOS
evaluation exists as a stored run tagged study/segment/window; open one, see
trades/journal; significance works (quickstart §2–§3).

### Models — `persisted` flag

- [ ] T002 [P] [US1] Failing tests: `WindowMetrics`/`SensitivityPoint` accept `persisted` (default `False`; pre-014 JSON without the key parses to `False`; `model_dump` round-trips it) in backend/tests/validation/test_persisted_flag.py
- [ ] T003 [US1] Add `persisted: bool = False` to `WindowMetrics` and `SensitivityPoint` in backend/src/intraday_trade_spy/models.py

### Shared payload builder (parity-locked refactor)

- [ ] T004 [P] [US1] Failing tests: `build_run_payload(result, ...)` maps a `BacktestResult` to a complete `PushRunPayload` (run row incl. `study_id`/`segment`/`window_index`/`config_snapshot`, trade/signal/journal rows); parity test asserting in-memory payload ≡ `gather_run_outputs()` payload for the same engine result written to disk, in backend/tests/storage/test_build_run_payload.py
- [ ] T005 [US1] Implement `build_run_payload()` in backend/src/intraday_trade_spy/storage/push.py and refactor `gather_run_outputs()` onto the shared row-mapper (public behavior byte-identical — parity test green)

### Persist callback (dedup + fail-soft)

- [ ] T006 [P] [US1] Failing tests for `make_study_persist()`: success → `(cloud_run_id, True)` and `push_run` called with tags + snapshot, then `set_run_spec_hash` stamped (api/lifecycle.py:310–325 pattern); dedup hit via `find_finished_run_by_spec` → existing id, `True`, no push; push raises → `(local_id, False)` and NO exception escapes, in backend/tests/api/test_study_persist_callback.py (stub storage client)
- [ ] T007 [US1] Implement `make_study_persist()` in backend/src/intraday_trade_spy/api/validation_lifecycle.py (`compute_spec_hash` → dedup lookup → `build_run_payload` → `client.push_run` → stamp spec_hash; catch/log all persistence errors)

### Orchestrator wiring

- [ ] T008 [P] [US1] Failing tests: `run_walk_forward_study`/`run_sensitivity_study` with `persist` injected stamp `run_id` + `persisted` into every `WindowMetrics`/`SensitivityPoint`; `persist=None` → result byte-identical to today; aggregate-math regression — result metrics equal across persist=healthy / None / always-raising, in backend/tests/validation/test_study_persistence.py
- [ ] T009 [US1] Add optional `persist` parameter to both study functions and call it from the `evaluate()` closures in backend/src/intraday_trade_spy/validation/study.py
- [ ] T010 [P] [US1] Failing tests: `run_study_task` builds the persist callback with user/config/strategy context and per-eval `config_snapshot` (walk-forward: study config knobs; sensitivity: base config merged with each grid-point's overrides) in backend/tests/api/test_validation_lifecycle_persist.py (stub storage + tiny fixture frame)
- [ ] T011 [US1] Wire `run_study_task()` to construct and inject the persist callback in backend/src/intraday_trade_spy/api/validation_lifecycle.py

### Lockbox child run

- [ ] T012 [P] [US1] Failing tests: `set_lockbox_ledger_run_id()` issues the ledger update; `run_lockbox()` persists its evaluation as a run with `segment='lockbox'`, `study_id=None` and writes `lockbox_ledger.run_id`, in backend/tests/api/test_lockbox_child_run.py
- [ ] T013 [US1] Implement `set_lockbox_ledger_run_id()` in backend/src/intraday_trade_spy/storage/client.py and persist-the-child + link-the-ledger in `run_lockbox()` in backend/src/intraday_trade_spy/api/validation_lifecycle.py

### Child runs visible in the API

- [ ] T014 [P] [US1] Failing tests: `RunView` exposes nullable `study_id`/`segment`/`window_index` (null for standalone; populated for a child) through `GET /runs/{id}` and list mapping, in backend/tests/api/test_runs_study_fields.py
- [ ] T015 [US1] Add the three fields to `RunView` in backend/src/intraday_trade_spy/api/schemas.py and thread them through the run mapping in backend/src/intraday_trade_spy/api/routers/runs.py / storage client row selection as needed

### Run detail badge (frontend)

- [ ] T016 [P] [US1] Failing tests: study-membership badge renders "Part of study — window N · segment" linking to `/validation/$studyId` when `study_id` present, absent otherwise (+ `?` HelpTooltip for "child run"), in frontend/src/components/run-study-badge.test.tsx
- [ ] T017 [US1] Implement `RunStudyBadge` in frontend/src/components/run-study-badge.tsx, add `study_id`/`segment`/`window_index` to the run type in frontend/src/api/runs.ts, and mount the badge in frontend/src/routes/_authenticated.runs_.$runId.tsx

**Checkpoint**: US1 fully functional — run quickstart §2–§4 against the dev
stack before proceeding (MVP gate).

---

## Phase 4: User Story 2 — Redesigned study detail page with drill-down (P2)

**Goal**: `/validation/$studyId` in the validation card language with
expandable window rows (Option B), sensitivity points table, link gating by
`persisted`, and tooltips.

**Independent Test**: open a finished post-014 walk-forward study → header +
stat cards + expandable rows with working "View run →"; a pre-014 study renders
the same page with links hidden (quickstart §2 step 4–5).

- [ ] T018 [P] [US2] Failing tests: `StudyHeaderCard` shows kind + config name, params subtitle, status badge (and a slot for the re-run action) in frontend/src/components/validation/StudyHeaderCard.test.tsx
- [ ] T019 [P] [US2] Failing tests: `StudyStatCards` — walk-forward variant (mean OOS expectancy, IS→OOS gap, windows, OOS trades) and sensitivity variant (metric, point count, best point) in frontend/src/components/validation/StudyStatCards.test.tsx
- [ ] T020 [P] [US2] Failing tests: `WindowRows` — collapsed row shows OOS verdict/gap/trades/low-confidence flag; expanding reveals IS/OOS detail pair; "View run →" renders ONLY when `persisted` is true and links to `/runs/$runId`; `?` HelpTooltip for IS/OOS drill-down, in frontend/src/components/validation/WindowRows.test.tsx
- [ ] T021 [P] [US2] Failing tests: `SensitivityPointsTable` — metric/coords/trade-count rows; run link gated by `persisted`, in frontend/src/components/validation/SensitivityPointsTable.test.tsx
- [ ] T022 [P] [US2] Implement `StudyHeaderCard` in frontend/src/components/validation/StudyHeaderCard.tsx
- [ ] T023 [P] [US2] Implement `StudyStatCards` in frontend/src/components/validation/StudyStatCards.tsx
- [ ] T024 [P] [US2] Implement `WindowRows` in frontend/src/components/validation/WindowRows.tsx
- [ ] T025 [P] [US2] Implement `SensitivityPointsTable` in frontend/src/components/validation/SensitivityPointsTable.tsx
- [ ] T026 [US2] Failing tests: study-detail page composition — walk-forward fixture renders header/stats/rows; sensitivity fixture renders surface card + points table; lockbox run link when ledger has run_id; pre-014 fixture shows zero run links, in frontend/src/routes/validation-study-detail.test.tsx
- [ ] T027 [US2] Recompose frontend/src/routes/_authenticated.validation_.$studyId.tsx with the new cards (surface plot wrapped in a card; shared section-title) and add `persisted` to result types in frontend/src/api/validation.ts

**Checkpoint**: US1 + US2 work together — drill-down e2e in the browser.

---

## Phase 5: User Story 3 — Re-run an old study (P3)

**Goal**: one-click clone of any study's kind+params into a fresh, drillable
study; buttons on StudiesTable rows and the detail header.

**Independent Test**: re-run a pre-014 study → new study with identical params
appears and (post-completion) is fully drillable (quickstart §5).

- [ ] T028 [P] [US3] Failing tests: `rerun_study()` loads the study row and calls `start_study(kind, config_name, params, confirm_large=True)`; endpoint `POST /api/validation/studies/{study_id}/rerun` → 202 `StudyRerunResponse`; 404 unknown id; deleted config surfaces `StudyConfigNotFound`, in backend/tests/api/test_validation_rerun.py
- [ ] T029 [US3] Implement `rerun_study()` in backend/src/intraday_trade_spy/api/validation_lifecycle.py, the endpoint in backend/src/intraday_trade_spy/api/routers/validation.py, and `StudyRerunResponse` in backend/src/intraday_trade_spy/api/schemas.py
- [ ] T030 [P] [US3] Failing tests: Re-run button on StudiesTable rows and StudyHeaderCard calls `rerunStudy(studyId)` and surfaces the new study (navigate/refetch); `?` HelpTooltip for "re-run study", in frontend/src/components/validation/StudiesTable.test.tsx (extend) and StudyHeaderCard.test.tsx (extend)
- [ ] T031 [US3] Implement `rerunStudy()` in frontend/src/api/validation.ts and wire the buttons in frontend/src/components/validation/StudiesTable.tsx and StudyHeaderCard.tsx

**Checkpoint**: all three studies-related stories functional.

---

## Phase 6: User Story 4 — Runs list stays clean (P3)

**Goal**: main runs list/sidebar never shows study children.

**Independent Test**: after a study with persisted children, the runs list
shows only standalone runs (quickstart §4).

- [ ] T032 [P] [US4] Failing tests: `list_runs()` applies `study_id IS NULL`; standalone runs (incl. dedup-referenced ones) still listed; cursor pagination unchanged, in backend/tests/storage/test_list_runs_filter.py
- [ ] T033 [US4] Add the `study_id IS NULL` filter to `list_runs()` in backend/src/intraday_trade_spy/storage/client.py

---

## Phase 7: Polish & Cross-Cutting

- [ ] T034 [P] Docs: mark 014 done in docs/research-tooling-uplift.md §4, update docs/automated-trading-roadmap.md §10 feature map, README features list, and CLAUDE.md prior-plans entry (at merge time)
- [ ] T035 Full verification: both offline suites green (baseline-relative), then execute quickstart.md §2–§7 against the live dev stack (small real walk-forward; re-run a pre-014 study; dedup spot-check; do NOT spend the lockbox) and record results in the PR/merge notes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)**: first.
- **Foundational**: none — stories start right after T001.
- **US1 (T002–T017)**: the MVP; no dependency on other stories.
- **US2 (T018–T027)**: UI reads `persisted` + real run ids — pairs with US1
  for end-to-end value, but is independently testable against fixtures.
- **US3 (T028–T031)**: backend rerun is independent; the StudyHeaderCard
  button slot lands in US2 (T018/T022) — implement backend first if running
  stories in parallel.
- **US4 (T032–T033)**: independent of everything; smallest story.
- **Polish (T034–T035)**: last.

### Within each story (TDD ordering — NON-NEGOTIABLE)

Every odd-listed failing-test task MUST be red before its paired
implementation task starts: T002→T003, T004→T005, T006→T007, T008→T009,
T010→T011, T012→T013, T014→T015, T016→T017, T018-T021→T022-T025, T026→T027,
T028→T029, T030→T031, T032→T033.

### Parallel Opportunities

- US1 test authoring: T002, T004, T006, T008, T010, T012, T014, T016 are all
  different files — write in parallel.
- US2: T018–T021 (tests) in parallel, then T022–T025 (impls) in parallel.
- US4 (T032–T033) can run any time after T001 — a good warm-up or filler.
- Backend (US1) and frontend (US2 fixtures-first) can proceed in parallel.

---

## Implementation Strategy

**MVP = Phase 3 (US1).** Persisted, tagged, deduped, fail-soft children +
study badge: the seam is closed even with the old detail page (links arrive in
US2). Validate via quickstart §2–§4, commit, then layer US2 → US3 → US4,
committing at each checkpoint. Sequential single-agent execution in priority
order is the default; the [P] markers matter mainly for batching test
authoring.
