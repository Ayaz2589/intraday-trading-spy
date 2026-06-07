---

description: "Task list for Historic Trade Replay (feature 022)"
---

# Tasks: Historic Trade Replay

**Input**: Design documents from `specs/022-historic-trade-replay/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/replay-api.md, quickstart.md

**Tests**: MANDATORY per constitution IV (Test-First Everywhere, v1.1.0). Every task touching
`backend/src/**/*.py` or `frontend/src/**/*.{ts,tsx}` is preceded by its failing-test task.
Config (`config.yaml`), docs, and the ≤5-line route/`__init__` wrappers are exempt.

**Backend test invocation**: from `backend/`, `PYTHONPATH=src .venv-sbx/bin/python -m pytest -q
-m "not slow and not integration" tests/test_replay_*.py`. **Frontend**: vitest in the docker
container. **No DB migration in this feature.**

**Reuse note**: This feature drives the existing backtest primitives (`strategy/`, `risk/`,
`broker/paper.py`, `clock.py`, `SessionState`) and reuses live-page frontend components. New
code is the `replay/` package, the `/api/replay/*` router, and the `HistoricTradePage` +
`ReplayControls` UI. See plan.md "Reuse inventory."

**Organization**: by user story (US1 P1 → US2 P2 → US3 P3), each independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: US1 / US2 / US3 (story phases only)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Package skeleton + config; no logic yet.

- [ ] T001 Create the `replay/` package skeleton: `backend/src/intraday_trade_spy/replay/__init__.py` (empty package marker, exempt wrapper).
- [ ] T002 Add the `replay` config block (`speeds: [1,10,30,60,300,600,1800,3600]`, `default_speed: 60`) to `backend/config/config.yaml` and extend the Pydantic `Config` model with an optional `ReplayConfig` in `backend/src/intraday_trade_spy/config.py` (config parsing — pair with T003).
- [ ] T003 [P] Failing test for `ReplayConfig` parsing/defaults in `backend/tests/test_replay_config.py` (asserts speeds list, default_speed, and that omission falls back to defaults). Precedes T002's source change.

**Checkpoint**: package importable, config knobs available.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The in-memory journal + session-state primitives and the replayable-date query
that ALL stories build on. ⚠️ No user-story work begins until this phase is complete.

- [ ] T004 [P] Failing test for `ReplayJournal` in `backend/tests/test_replay_journal.py`: monotonically increasing `seq`, append-only, emits `PaperEvent`-shaped dicts (`seq`/`trading_day`/`timestamp`/`kind`/`payload`), `since_seq` filtering.
- [ ] T005 Implement `ReplayJournal` in `backend/src/intraday_trade_spy/replay/journal.py` reusing the live `kind` vocabulary (`emitted/approved/rejected/executed/exited/force_flat/skipped_window` + `session_started/day_rolled/replay_completed`). (depends on T004)
- [ ] T006 [P] Failing test for `ReplaySession` in `backend/tests/test_replay_session.py`: lifecycle transitions (playing⇄paused→completed/stopped), one-position invariant, bars_delivered≤bars_total, derived-not-stored `armed`.
- [ ] T007 Implement `ReplaySession` state model in `backend/src/intraday_trade_spy/replay/session.py` (fields per data-model.md; holds `RiskState`, `open_position`, `trades`, `events`, sim_clock, speed). (depends on T006)
- [ ] T008 [P] Failing test for replayable-date discovery in `backend/tests/test_replay_dates.py`: intersection of `bars_present_session_dates` with `expected_session_dates`; excludes weekends/holidays/missing-data dates; newest-first ordering.
- [ ] T009 Implement `list_replayable_dates(storage, *, range_start, range_end)` helper in `backend/src/intraday_trade_spy/replay/dates.py` reusing `storage.bars_present_session_dates` + `data/market_calendar.expected_session_dates`. (depends on T008)

**Checkpoint**: journal, session state, and date discovery exist and are tested.

---

## Phase 3: User Story 1 — Replay a past session and watch it unfold (Priority: P1) 🎯 MVP

**Goal**: Pick a covered date, press Play, watch bars + VWAP/OR build under a simulated clock
with play/pause/speed and an end-of-session recap. No trading yet.

**Independent Test**: Start a replay of a known date, confirm bars arrive in chronological
order with indicators updating, pause/resume halts/resumes delivery, speed change takes effect
without restart, and the replay ends at the close.

### Tests for User Story 1 ⚠️ (write first, must fail)

- [ ] T010 [P] [US1] Failing test for the replay loader in `backend/tests/test_replay_engine.py::test_loads_session_bars_et`: `list_bars` for a date → ET-converted, session-filtered, chronologically ordered `Bar` list with correct `session_date` (reuses `data/loader` conversion semantics).
- [ ] T011 [P] [US1] Failing test for the simulated clock / bar-surfacing in `backend/tests/test_replay_runner.py::test_speed_surfaces_bars_at_boundaries`: at speed S, sim-clock advances S sim-seconds per real second and a bar surfaces exactly when sim-clock crosses its boundary; multiple bars per tick at high speed; no bars skipped (SC-002).
- [ ] T012 [P] [US1] Failing test for `SessionState` indicator wiring in `backend/tests/test_replay_engine.py::test_indicator_snapshot_per_bar`: each delivered bar yields an `IndicatorSnapshot` with VWAP/OR matching `attach_indicators` (chart parity).
- [ ] T013 [P] [US1] Failing tests for the lifecycle/control endpoints in `backend/tests/test_replay_api.py` (start/state/control/stop): start returns 201+state; second start → 409; uncovered date → 422; control play/pause/speed mutates state; stop → status stopped; state with no replay → 200 with `session:null`.
- [ ] T014 [P] [US1] Failing test for `GET /api/replay/bars` incremental delivery in `backend/tests/test_replay_api.py::test_bars_incremental` (since-cursor, vwap fields, next_since).
- [ ] T015 [P] [US1] Failing frontend test `frontend/src/components/trade/ReplayControls.test.tsx`: renders date picker (from `/replay/dates`), Play/Pause toggles, speed selector with the 8 options, progress indicator; calls the right hooks.
- [ ] T016 [P] [US1] Failing frontend test `frontend/src/components/trade/HistoricTradePage.test.tsx`: renders ReplayControls + reused LiveChart, shows the "historical simulation" label (FR-016), reattaches to running replay via `useReplayState`.

### Implementation for User Story 1

- [ ] T017 [US1] Implement the replay bar loader in `backend/src/intraday_trade_spy/replay/engine.py` (`load_session_bars(storage, session_date, cfg)` → ordered `Bar` list; reuses loader ET/session conversion). (depends on T010)
- [ ] T018 [US1] Implement `ReplayEngine.on_bar(bar)` indicator path in `backend/src/intraday_trade_spy/replay/engine.py`: append to `SessionState`, produce `IndicatorSnapshot`, record bar for chart/journal; no trading yet. (depends on T012, T017)
- [ ] T019 [US1] Implement `ReplayRunner` pacing loop + `REPLAY_RUNNING` registry in `backend/src/intraday_trade_spy/replay/runner.py`: asyncio task, continuous sim-clock at `speed`, surfaces bars at boundary crossings, play/pause/speed/stop, marks `completed` at session close, emits `session_started`/`replay_completed` journal events. (depends on T011, T018, T005, T007)
- [ ] T020 [US1] Create the replay router in `backend/src/intraday_trade_spy/api/routers/replay.py` with `GET /dates`, `POST /start`, `GET /state`, `POST /control`, `POST /stop`, `GET /bars` per contracts; auth + storage DI mirroring `trade.py`; one-active-per-user guard. (depends on T009, T013, T014, T019)
- [ ] T021 [US1] Register `replay.router` under `/api` in `backend/src/intraday_trade_spy/api/app.py` (≤5-line edit; covered by T013 API tests). (depends on T020)
- [ ] T022 [P] [US1] Add `frontend/src/api/replay.ts` (getReplayDates/getReplayState/startReplay/controlReplay/stopReplay/getReplayBars) mirroring `api/trade.ts`. (depends on T013, T014)
- [ ] T023 [P] [US1] Add `frontend/src/hooks/useReplay.ts` (useReplayDates, useReplayState with running-aware refetch, useReplayBars incremental, start/control/stop mutations). (depends on T022)
- [ ] T024 [US1] Implement `frontend/src/components/trade/ReplayControls.tsx` (date picker, play/pause, speed selector, progress; HelpTooltips). (depends on T015, T023)
- [ ] T025 [US1] Implement `frontend/src/components/trade/HistoricTradePage.tsx` composing ReplayControls + reused `LiveChart`; unmistakable "historical simulation" banner. (depends on T016, T024)
- [ ] T026 [US1] Add the route `frontend/src/routes/_authenticated.trade_.historic.tsx` → `/trade/historic` (≤5-line wrapper) and the **Historic Trade** nav entry (depth 1 under Trade) in `frontend/src/components/side-nav.tsx`. (depends on T025)
- [ ] T027 [P] [US1] Add help-content keys (`replay`, `simulated_clock`, `playback_speed`) to `frontend/src/components/help-content.ts` and a help-coverage assertion (constitution VI). (depends on T025)

**Checkpoint**: A user can replay any covered date with full time control and a recap — MVP.

---

## Phase 4: User Story 2 — Manually trade the replay (Priority: P2)

**Goal**: Risk-gated manual buys (stop+target mandatory) and closes that fill against history
with the honest cost model; position/P&L visible; 15:55 force-flat; everything journaled.

**Independent Test**: During a replay, submit a manual buy with stop+target, watch it fill at
next-bar-open with costs, exit via target/stop/force-flat, and verify journal + P&L
consistency; a stop-less order is rejected and journaled.

### Tests for User Story 2 ⚠️ (write first, must fail)

- [ ] T028 [P] [US2] Failing tests for manual-entry fills in `backend/tests/test_replay_engine.py::test_manual_entry_next_bar_open`: accepted on bar N, fills at bar N+1 open + slippage via reused `broker/paper.py`; never fills on bar N (no-look-ahead, constitution gate).
- [ ] T029 [P] [US2] Failing tests for bracket exits in `backend/tests/test_replay_engine.py::test_bracket_mutual_exclusion`: stop/target fill intrabar via `simulate_bar`; one leg cancels the other; same-bar span → conservative stop-first (constitution gate).
- [ ] T030 [P] [US2] Failing tests for risk veto + long-only in `backend/tests/test_replay_engine.py::test_manual_risk_rejections`: missing stop → rejected+journaled (SC-006); sell with no/over position → rejected (long-only); over-cap size rejected.
- [ ] T031 [P] [US2] Failing test for force-flat in `backend/tests/test_replay_engine.py::test_force_flat_1555`: open position at 15:55 sim-time → flattened at next-bar-open (or synth close on last bar), journaled `force_flat`.
- [ ] T032 [P] [US2] Failing tests for the manual endpoints in `backend/tests/test_replay_api.py` (`POST /orders`, `POST /position/close`, `GET /performance`): 202 accept, 409 conflicts, 422 missing-stop, performance recap shape.
- [ ] T033 [P] [US2] Failing frontend test for manual trading in `frontend/src/components/trade/HistoricTradePage.test.tsx` (extend): reused `ManualOrderForm` + `AccountPanel` render and call `useSubmitReplayOrder`/`useCloseReplayPosition`.

### Implementation for User Story 2

- [ ] T034 [US2] Implement the trading core in `ReplayEngine` (`backend/src/intraday_trade_spy/replay/engine.py`): per-bar sequence reproducing `backtest/engine.py` — force-flat → `simulate_bar` exits → entry-on-next-bar-open; manual-order intake queue; risk validation via reused `RiskManager`; close handling; journal every step. (depends on T028, T029, T030, T031)
- [ ] T035 [US2] Wire performance/recap aggregation in `backend/src/intraday_trade_spy/replay/session.py` (summary, equity curve, per-trade rows from `trades`, reusing the live `TradePerformance` shape). (depends on T034)
- [ ] T036 [US2] Add `POST /orders`, `POST /position/close`, `GET /performance` to `backend/src/intraday_trade_spy/api/routers/replay.py` per contracts. (depends on T032, T034, T035)
- [ ] T037 [P] [US2] Extend `frontend/src/api/replay.ts` + `frontend/src/hooks/useReplay.ts` with submitReplayOrder/closeReplayPosition/useReplayPerformance. (depends on T036)
- [ ] T038 [US2] Add reused `ManualOrderForm` + `AccountPanel` + `ForwardPerformance` (recap) to `HistoricTradePage.tsx`, wired to replay hooks. (depends on T033, T037)
- [ ] T039 [P] [US2] Add help keys (`simulated_fill`, `session_recap`) to `frontend/src/components/help-content.ts` + coverage. (depends on T038)

**Checkpoint**: Manual trading works end-to-end against history with honest fills + recap.

---

## Phase 5: User Story 3 — Watch the automated strategy trade the replay (Priority: P3)

**Goal**: Toggle automation; the VWAP-pullback strategy trades the replay live; signals,
skips, approvals/rejections, brackets, exits all journaled; backtest-identical decisions.

**Independent Test**: Replay a date with automation on; verify entries/exits match a backtest
of the same date/config exactly (SC-004), and skipped/rejected setups appear in the journal.

### Tests for User Story 3 ⚠️ (write first, must fail)

- [ ] T040 [P] [US3] Failing **parity** test `backend/tests/test_replay_backtest_parity.py` (SC-004): a max-speed automation-only replay of a fixed fixture date produces trades equal to a backtest of the same date/config (entries, exits, prices, R, exit_reason).
- [ ] T041 [P] [US3] Failing test in `backend/tests/test_replay_engine.py::test_automation_journals_skips_and_rejections`: WindowSkip → `skipped_window` event; no-signal bars produce no entry; rejected signals journaled (VII).
- [ ] T042 [P] [US3] Failing test for automation pause/resume mid-position in `backend/tests/test_replay_runner.py::test_pause_preserves_position`: position + pending bracket state preserved exactly across pause→resume (US3 AS4).
- [ ] T043 [P] [US3] Failing test for the automation toggle endpoint in `backend/tests/test_replay_api.py::test_automation_toggle` (`POST /control {action:"automation", enabled}` or start-param), and that state reflects automation status.
- [ ] T044 [P] [US3] Failing frontend test `frontend/src/components/trade/HistoricTradePage.test.tsx` (extend): automation toggle renders, drives `useReplay` control, journal table shows streamed decisions.

### Implementation for User Story 3

- [ ] T045 [US3] Enable automated evaluation in `ReplayEngine.on_bar` (`backend/src/intraday_trade_spy/replay/engine.py`): when automation on, call reused `strategy.evaluate` → handle Signal/WindowSkip/None → risk → entry, journaling each outcome; reuse the same fill path as manual. (depends on T040, T041, T034)
- [ ] T046 [US3] Add automation on/off control (start-param + `POST /control`) in `backend/src/intraday_trade_spy/api/routers/replay.py` and carry the flag in `ReplaySession`. (depends on T043, T045)
- [ ] T047 [US3] Ensure pause/resume preserves engine + session position/bracket state in `runner.py`/`session.py` (no re-init on resume). (depends on T042, T045)
- [ ] T048 [US3] Add the automation toggle + reused `LiveJournalTable` to `HistoricTradePage.tsx`, wired to replay hooks. (depends on T044, T046)
- [ ] T049 [P] [US3] Add help key (`strategy_automation_replay`) to `frontend/src/components/help-content.ts` + coverage. (depends on T048)

**Checkpoint**: All three stories independently functional; automation is backtest-faithful.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T050 [P] Run the full backend replay suite + a frontend vitest pass; confirm green (`tests/test_replay_*.py`, replay frontend tests).
- [ ] T051 [P] Edge-case tests in `backend/tests/test_replay_engine.py`: early-close session (force-flat offset + recap respect actual length); mid-session data gap ends replay gracefully with explanation (spec Edge Cases).
- [ ] T052 [P] Independence test in `backend/tests/test_replay_api.py::test_replay_independent_of_live`: a replay never reads/writes `paper_*` tables and never touches a live session/registry (SC-005 structural check).
- [ ] T053 Update `specs/022-historic-trade-replay/quickstart.md` if any endpoint/path drifted during implementation; add an `EXPERIMENTS.md` note only if a replay surfaced a research insight (skill-gated, optional).
- [ ] T054 Run `quickstart.md` validation manually against the local stack (start→play→manual trade→automation→recap→stop) and capture a screenshot to `screenshots/`.

---

## Dependencies & Execution Order

### Phase dependencies
- **Setup (P1)** → **Foundational (P2)** → **US1 (P3)** → **US2 (P4)** → **US3 (P5)** → **Polish (P6)**.
- US2 and US3 both extend `ReplayEngine`/router/page from US1; they share the trading core
  (US2 builds it at T034, US3 reuses it at T045), so US3 depends on US2's T034.

### Within each story
- Tests (failing) precede implementation (constitution IV).
- Backend engine/runner before router before frontend api→hooks→components→route/nav.

### Parallel opportunities
- T003 (config test) ∥ nothing else in Setup.
- Foundational test tasks T004/T006/T008 run in parallel; each unblocks its impl.
- Within US1: all test tasks T010–T016 in parallel; frontend T022/T023/T027 parallel with
  backend once contracts are fixed.
- US2 tests T028–T033 in parallel; US3 tests T040–T044 in parallel.
- Polish T050/T051/T052 in parallel.

---

## Implementation Strategy

### MVP (US1 only)
Setup → Foundational → US1 → **stop & validate**: a watchable, speed-controlled replay of any
covered date with a recap. Demoable on its own.

### Incremental delivery
US1 (watch) → US2 (trade it by hand, honest fills) → US3 (watch the strategy, backtest-faithful).
Each ships independent value without breaking the prior.

---

## Notes
- No DB migration; replay state is in-memory (`REPLAY_RUNNING`). SC-005 is structural.
- SC-004 parity (T040) is the linchpin test — it is why automation runs the backtest primitives.
- Commit per story; the user merges only on their word.
- Reuse first: do not fork strategy/risk/broker/clock/SessionState or the live frontend panels.
