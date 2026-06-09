# Tasks: Pre-Open Warmup for Live Paper Trading

**Feature**: `023-paper-preopen-warmup` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**TDD is mandatory** (Constitution P4). Every production change is preceded by a failing test. Backend-only; no new deps, no migration, no frontend.

**Paths** (repo root `/Users/ayazuddin/Development/personal/Trading/intraday-trading-SPY`):
- Engine: `backend/src/intraday_trade_spy/live/engine.py`
- Runner: `backend/src/intraday_trade_spy/live/runner.py`
- Session state: `backend/src/intraday_trade_spy/live/session_state.py` (reuse `warmup()`)
- Start path: `backend/src/intraday_trade_spy/api/routers/trade.py`
- Tests: `backend/tests/live/` and `backend/tests/api/`

---

## Phase 1: Setup

- [X] T001 Confirm the Dockerized backend test env runs the existing live suite green as a baseline: `docker compose exec backend pytest tests/live -q` (or `backend/.venv` equivalent). Record the baseline pass count — no code changes.

---

## Phase 2: Foundational (blocking prerequisites)

- [X] T002 Test helpers for pre-open + RTH `Bar` sequences. **Done by reusing the existing per-file `_bar()` helpers** in `test_engine.py` / `test_aggregator.py` / `test_runner.py` (the codebase convention is per-file fakes, not a shared `conftest.py`), plus local `_rth_5m_bars()` / `_warmup_1m_df()` builders. No new conftest, no production code.

---

## Phase 3: User Story 1 — Pre-open guard (Priority: P1) 🎯 MVP

**Goal**: Bars before `clock.session_start` are journaled `pre_open` and dropped — never appended/evaluated — so VWAP/OR stay anchored at 09:30 and no pre-open trade occurs.

**Independent test**: Feed pre-open (09:00–09:25) then RTH (09:30+) bars to a `LiveSessionEngine`; assert indicator parity vs. an RTH-only control, no signal events for pre-open bars, and one `pre_open` journal event per pre-open bar.

### Tests first (write, run, confirm RED)

- [X] T003 [P] [US1] In `backend/tests/live/test_engine.py`, add a test that feeding pre-open 5m bars does NOT increase `session_state.bar_count` and produces no `emitted`/`approved`/`executed` signal events (assert against the captured journal). (FR-002, C1)
- [X] T004 [P] [US1] In `backend/tests/live/test_engine.py`, add a parity test: an engine fed [pre-open bars + RTH bars] yields VWAP, or_high, or_low, or_complete for each RTH bar byte-identical to an engine fed only the RTH bars. (SC-002, FR-003/FR-004)
- [X] T005 [P] [US1] In `backend/tests/live/test_engine.py`, add a test asserting exactly one `pre_open` lifecycle journal event per pre-open bar, with correct timestamp/trading_day. (FR-005)
- [X] T006 [P] [US1] In `backend/tests/live/test_aggregator.py`, add a boundary test: 1m bars spanning 09:25–09:34 emit a distinct pre-open 5m bar (09:25 bucket) and a clean 09:30 5m bar whose volume/high/low exclude all ≤09:29 bars. (C3, regression lock)

### Implementation (make GREEN)

- [X] T007 [US1] In `backend/src/intraday_trade_spy/live/engine.py`, add the pre-open guard at the top of `on_five_minute_bar`: if the bar's ET time is `< self.clock.session_start`, call `self.journal.lifecycle("pre_open", timestamp=bar.timestamp, trading_day=bar.session_date)` and `return` before `_roll_day`/`append`/`_evaluate`. Use the clock (no hardcoded 09:30). (C1, FR-002/FR-003/FR-005)
- [X] T008 [US1] Run US1 tests (T003–T006) and the full `tests/live` suite; confirm GREEN with no regressions to existing engine/aggregator tests.

**Checkpoint**: US1 independently delivers a safe pre-open start (the core ask) and fixes the latent VWAP/OR corruption.

---

## Phase 4: User Story 2 — Warmup wiring (Priority: P2)

**Goal**: On session start, backfill today's elapsed RTH 5m bars (09:30→now) via `SessionState.warmup()` so indicators are correct on the first live bar; fail-soft if the fetch is empty/errors; journal the warmup outcome.

**Independent test**: A session warmed up with 09:30→T bars then given the next live bar produces indicator values identical to a session that processed 09:30→that-bar bar-by-bar.

### Tests first (write, run, confirm RED)

- [X] T009 [P] [US2] In `backend/tests/live/test_session_state.py` (or `test_runner.py`), add a warmup-parity test: `SessionState.warmup(rth_bars_0930_to_T)` followed by `append(next_bar)` yields the same snapshot as appending 09:30→next_bar one-by-one. (SC-003, C2)
- [X] T010 [P] [US2] In `backend/tests/live/test_runner.py`, add a test that `PaperSessionRunner` applies supplied warmup bars to the engine's `SessionState` before any streamed bar is processed (assert `bar_count` reflects warmup pre-stream). (C2)
- [X] T011 [P] [US2] In `backend/tests/api/` (paper-trading start tests), add tests that the start path: (a) journals a `warmup` event with `loaded=N`; (b) when the warmup fetch returns empty/raises, the session still starts and journals `warmup` with `loaded=0`/reason — no exception escapes. (FR-006/FR-008)
- [X] T012 [P] [US2] Add a test asserting warmup bars are RTH-only (the fetch starts at 09:30 → no pre-open bar can enter warmup). (FR-007)

### Implementation (make GREEN)

- [X] T013 [US2] In `backend/src/intraday_trade_spy/live/runner.py`, add an optional `warmup_bars` parameter to `PaperSessionRunner.__init__` and apply `self._engine.session_state.warmup(warmup_bars)` before streaming starts (constructor or top of `run()` before tasks). Default empty. (C2)
- [X] T014 [US2] In `backend/src/intraday_trade_spy/api/routers/trade.py` (`run_paper_session_task`), fetch today's RTH 1m frame via the existing `fetch_intraday_df()`, aggregate to completed 5m `Bar`s (reuse the existing 5m bucketing path), pass as `warmup_bars` to `PaperSessionRunner`, and journal the `warmup` outcome. Wrap the fetch/aggregate in try/except → fail-soft to empty warmup with a journaled reason (never crash the start). (FR-006/FR-008, R3/R4)
- [X] T015 [US2] Run US2 tests (T009–T012) and the full `tests/live` + relevant `tests/api` suites; confirm GREEN.

**Checkpoint**: US1 + US2 together — early start is safe AND at-open/mid-session starts have correct indicators on the first live bar.

---

## Phase 5: Polish & Cross-Cutting

- [X] T016 [P] Verify constitution gates: run `backend/tests/live/test_constitution_gates.py` (paper-first/SPY-only/journal) still green; confirm no `live_auto_enabled` change and the paper endpoint hard-assert is intact. (P1/P5/P7)
- [X] T017 [P] Run the FULL offline backend suite (`make test`) and confirm zero regressions vs. the T001 baseline.
- [X] T018 Update `specs/023-paper-preopen-warmup/quickstart.md` if any behavior detail shifted during implementation; mark the live-session walkthrough as deferred-to-next-session (matching the 021/022 verification pattern).
- [X] T019 Update the CLAUDE.md SPECKIT active-plan line from **planned** → **implemented** with the final test counts.

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002)** → **US1 (T003–T008)** → **US2 (T009–T015)** → **Polish (T016–T019)**.
- US1 is fully independent and is the MVP. US2 depends only on the shared test helper (T002), not on US1 code, but is sequenced after US1 for a clean checkpoint.
- Within each story, all `[P]` test tasks can be written in parallel (same or sibling test files, independent assertions). Implementation tasks (T007, T013, T014) are sequential per file.

## Parallel Execution Examples

- US1 tests: T003, T004, T005 (test_engine.py) + T006 (test_aggregator.py) authored together, then run RED as a batch.
- US2 tests: T009 (test_session_state.py), T010 (test_runner.py), T011/T012 (tests/api) authored together.
- Polish: T016 and T017 run in parallel.

## MVP Scope

**User Story 1 alone** (T001–T008) is a shippable MVP: it makes pre-open start safe and fixes the latent indicator corruption. US2 adds correctness for at-open/mid-session starts.

## Format validation

All tasks use `- [ ] [TaskID] [P?] [Story?] description + file path`. Setup/Foundational/Polish carry no story label; US1/US2 tasks carry `[US1]`/`[US2]`.
