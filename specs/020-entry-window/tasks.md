# Tasks: Entry-Window Filter Knobs

**Input**: Design documents from `/specs/020-entry-window/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/knobs.md

**Tests**: Per constitution IV every backend/src + frontend/src implementation
task is preceded by its failing-test task. Exempt: config.yaml block, help
text content, docs.

**Organization**: by user story (US1 = the window in the engine, US2 =
registry/search, US3 = UI surface).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [x] T001 Add the `entry_window:` block (start 0 / end 360, commented with the 09:4x evidence) under `strategy.vwap_pullback` in backend/config/config.yaml — config, exempt

## Phase 2: Foundational

- [x] T002 Failing tests: `MarketClock.minutes_since_open` (ET conversion, whole minutes, negative before open, DST-day sanity) in backend/tests/test_clock.py; `EntryWindowConfig` defaults/bounds and the start≥end rejection naming both values (FR-004), plus params-without-keys → defaults (FR-010) in backend/tests/test_config.py
- [x] T003 Implement `minutes_since_open` in backend/src/intraday_trade_spy/clock.py and `EntryWindowConfig` (+ validator, wired into `VwapPullbackConfig`) in backend/src/intraday_trade_spy/config.py

**Checkpoint**: time + config primitives exist.

---

## Phase 3: User Story 1 - Constrain when the strategy may enter (P1) 🎯 MVP

**Goal**: out-of-window setups become journaled `SKIPPED_WINDOW` rows, never trades; defaults change nothing.

**Independent Test**: fixture backtest with defaults == pre-feature baseline; with a 30→270 window: zero entries outside 10:00–14:00 ET and one skip row per suppressed setup (SC-001/SC-002).

### Tests (write first, watch fail)

- [x] T004 [P] [US1] Failing tests for the tri-state strategy in backend/tests/test_strategy_vwap_pullback.py (or its existing module): valid setup inside window → Signal (unchanged fields); valid setup before start / after end → `WindowSkip` carrying window values + reason; NON-setup outside the window → None (skips only for real setups); defaults + any in-session minute → never WindowSkip; OR-incomplete still → None regardless of window (scenario 4)
- [x] T005 [P] [US1] Failing tests for models in backend/tests/test_models.py (or equivalent): `SignalStatus.SKIPPED_WINDOW == "skipped_window"`; `WindowSkip` frozen with required fields
- [x] T006 [US1] Failing engine tests in backend/tests/test_backtest_engine.py (or the engine's existing test module): WindowSkip → exactly one SKIPPED_WINDOW journal row with indicator context, no risk call, no position, no state change; default-window run produces the identical journal/trade sequence the existing golden tests pin (FR-010 — existing engine tests must pass unmodified); a 30→270 run on the fixture has no entries outside the window and ≥1 skip row; `compute_summary` is neutral to SKIPPED_WINDOW rows (R5) in backend/tests/test_metrics.py or equivalent

### Implementation

- [x] T007 [US1] Add `SKIPPED_WINDOW` + `WindowSkip` in backend/src/intraday_trade_spy/models.py
- [x] T008 [US1] Window gate in backend/src/intraday_trade_spy/strategy/vwap_pullback.py (+ signature in strategy/base.py): full detection unchanged; between validity and Signal construction compare `minutes_since_open` to cfg.entry_window; out-of-window valid setups return WindowSkip
- [x] T009 [US1] Engine wiring in backend/src/intraday_trade_spy/backtest/engine.py: compute minutes via the clock, pass to evaluate, journal WindowSkip via `_log_signal`-style row with status SKIPPED_WINDOW and the skip's reason

**Checkpoint**: US1 shippable — the knob works end to end in backtests.

---

## Phase 4: User Story 2 - Search the window honestly (P2)

**Goal**: both knobs are first-class registry citizens (sweeps, sanitation, candidates, campaigns).

**Independent Test**: `study-sens --knob start_minutes_after_open --values 0,15,30,45` runs from the CLI; out-of-bounds values are dropped by sanitation (SC-003/SC-004).

### Tests (write first, watch fail)

- [x] T010 [P] [US2] Failing tests in backend/tests/validation/test_knobs.py (or the registry's existing module): both paths registered with bounds [0, 390] int + the exact labels; `sanitize_changes` accepts 30/270, drops 500 and −5; `registry_prompt_section` lists both; leaves remain unique registry-wide (CLI leaf resolution contract)

### Implementation

- [x] T011 [US2] Add the two KnobSpecs in backend/src/intraday_trade_spy/validation/knobs.py

**Checkpoint**: sweeps/recommendations/campaigns can reference the window (the CLI + campaign machinery need no changes — registry membership is the contract, verified by T010 + the existing 019 suites).

---

## Phase 5: User Story 3 - See and edit the window in the UI (P3)

**Goal**: editor fields, diff chips, sensitivity pills, tooltip + glossary.

**Independent Test**: editor round-trips 30/270 with off-default highlighting; config row shows the chips; launcher shows the pills; glossary shows the concept (SC-005).

### Tests (write first, watch fail)

- [x] T012 [P] [US3] Failing tests in frontend/src/lib/config-knobs.test.ts: KNOB_DEFAULTS gains entry_start_minutes 0 / entry_end_minutes 360; knobsFromConfig reads the nested entry_window paths (and defaults when absent); buildParams writes them back; KNOB_PATH_LABELS + SENSITIVITY_KNOBS cover both paths (grids 0/15/30/45 and 240/270/300/360 — the existing straddle/ascending invariant tests extend); configDiffChips emits accent extras ('entry from' / 'entry until') only when off-default
- [x] T013 [P] [US3] Failing tests in frontend/src/components/strategies/config-editor.test.tsx: two Signal-group fields render with default hints; editing flags off-default; save round-trips into params; the `entry_window` tooltip is present
- [x] T014 [P] [US3] Update frontend/src/components/help-content.test.ts (89 concepts incl. `entry_window`) and the run-viewer exclusion list in frontend/src/routes/run-viewer.test.tsx

### Implementation

- [x] T015 [US3] Extend frontend/src/lib/config-knobs.ts (KnobValues, defaults, from/to params, labels, diff-chip extras, SENSITIVITY_KNOBS)
- [x] T016 [US3] Add the two SIGNAL_FIELDS (+ `entry_window` help key) in frontend/src/components/strategies/config-editor.tsx
- [x] T017 [US3] Add the `entry_window` HELP_CONTENT entry (what/why-evidence/how) in frontend/src/components/help-content.ts — content exempt, coverage tested by T014

**Checkpoint**: all stories functional.

---

## Phase 6: Polish & Verification

- [x] T018 Full gates: backend pytest (env-gated excluded), ruff on touched files; frontend vitest (price-chart 3-test baseline) + typecheck
- [x] T019 Live e2e per quickstart: `make study-sens CONFIG=default KNOB=start_minutes_after_open VALUES=0,15,30,45` (the hypothesis sweep, via the registry path just added) and confirm the surface persists + skip rows appear in a windowed run's journal
- [x] T020 [P] Docs: CLAUDE.md active-plan line → implemented — docs, exempt

## Dependencies & Execution Order

Setup → Foundational → US1 → US2 (independent of US1's engine work but ordered for narrative) → US3 (depends on US2's paths for labels/grids) → Polish. Within stories: failing tests strictly first. T004 ∥ T005; T012 ∥ T013 ∥ T014.

## Implementation Strategy

US1 alone is the MVP (the knob works via raw params even without registry/UI). US2 is two small diffs that unlock the search machinery. US3 is surface. Commit per story; stop at checkpoints.
