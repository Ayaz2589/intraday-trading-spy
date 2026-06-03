---
description: "Task list for Feature 010 — Make the Backtest Honest"
---

# Tasks: Make the Backtest Honest

**Input**: Design documents from `/specs/010-honest-backtest/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: MANDATORY (constitution IV, Test-First Everywhere). Every task touching `backend/src/**/*.py` or `frontend/src/**/*.{ts,tsx}` is preceded by a failing-test task. Config YAML and fixture data are TDD-exempt.

**Organization**: Grouped by the 4 user stories from spec.md (P1→P4) for independent, incremental delivery.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete-task dependency)
- **[Story]**: US1–US4 maps to spec user stories
- Paths are repo-relative (`backend/`, `frontend/`)

---

## Phase 1: Setup (Shared, TDD-exempt artifacts)

- [X] T001 [P] In `backend/config/config.yaml`: set `broker.slippage_per_share: 0.01` (fees stay `0.0`) and add a new `metrics:` block (`trading_days_per_year: 252`, `risk_free_rate: 0.0`, `win_rate_ci_confidence: 0.95`, `low_confidence_trade_count: 30`). [config — exempt] ✅
- [X] T002 [P] **Reuse** the existing golden fixture `backend/tests/fixtures/spy_5m_sample.csv` (3 trades, qty 44 each — deterministic) instead of a redundant CSV; record the exact expected gross/fees/slippage/net PnL in `backend/tests/fixtures/cost_fixture_expected.md` for SC-002 (total slippage = 0.01×44×2×3 = $2.64, fees $0). [fixture data — exempt] ✅

---

## Phase 2: Foundational (Blocking prerequisites for US1–US3)

**⚠️ CRITICAL**: Config + data-model definitions all stories build on. No story work begins until this phase is complete.

- [X] T003 In `backend/tests/test_config.py`: add FAILING tests asserting `MetricsConfig` parses the new `metrics` block with the documented defaults and that `BrokerConfig.slippage_per_share` defaults to `0.01`. ✅
- [X] T004 In `backend/src/intraday_trade_spy/config.py`: add `MetricsConfig` model, add `metrics: MetricsConfig` to `Config`, and update `BrokerConfig.slippage_per_share` default to `0.01`. (Makes T003 pass.) ✅
- [X] T005 In `backend/tests/test_models.py`: add FAILING tests for new fields — `Position`/`JournalEntry` cost fields (`gross_pnl`, `fees`, `slippage_cost`), `SummaryMetrics` new metric fields (expectancy_r/$, sharpe, sortino, max_drawdown_dollars/_pct, distribution, CI bounds, low_confidence, equity_curve, *_buckets), and the new `EquityPoint` + `Bucket` value objects (defaults `None`, serialization round-trip). ✅
- [X] T006 In `backend/src/intraday_trade_spy/models.py`: add the cost fields to `Position` and `JournalEntry`; add the new metric fields to `SummaryMetrics`; add frozen `EquityPoint` and `Bucket` `BaseModel`s. (Makes T005 pass; population happens per-story.) ✅

**Checkpoint**: Config + models ready — story phases can begin.

---

## Phase 3: User Story 1 — Net-of-cost backtest results (Priority: P1) 🎯 MVP

**Goal**: Costs (adverse slippage on fills + per-share fees) deducted on entry and exit so all PnL is net.

**Independent Test**: Zero-cost vs non-zero run → net is strictly lower by exactly the modeled cost; the committed fixture reproduces exact net PnL.

### Tests for User Story 1 ⚠️ (write first, must FAIL)

- [X] T007 [P] [US1] In `backend/tests/test_paper_broker.py`: FAILING tests that slippage moves fills adversely — entry `= next_bar.open + slippage`, stop exit `= stop − slippage`, target exit `= target − slippage`, force-flat `= next_bar.open − slippage`; slippage never improves a fill.
- [X] T008 [P] [US1] In `backend/tests/test_paper_broker.py`: FAILING tests that fees are deducted both sides (`fees == fees_per_share × qty × 2`), `realized_pnl == gross_pnl − fees`, and `gross_pnl`/`fees`/`slippage_cost` are populated on the `Position`.
- [X] T009 [P] [US1] In `backend/tests/test_cost_fixture.py` (new): FAILING test that running the T002 fixture reproduces the exact expected net PnL and total cost (SC-002), **asserting the summary fields `total_net_pnl_dollars`, `total_fees_dollars`, and `total_slippage_dollars`** against hand-computed values (covers the T014 aggregates, constitution IV).
- [X] T010 [P] [US1] In `backend/tests/test_backtest_engine.py`: FAILING tests that (a) the non-zero-cost total = zero-cost total − total modeled cost (SC-001), with `total_fees_dollars + total_slippage_dollars` equal to that gap; and (b) a force-flat exit is also net of costs.
- [X] T011 [P] [US1] In `backend/tests/test_backtest_engine.py`: FAILING test that the daily-loss lockout (`_apply_exit_to_state` → `daily_realized_pnl`) trips on **net** realized PnL (more conservative).
- [X] T011a [P] [US1] In `backend/tests/test_journal.py`: FAILING test (constitution VII) that an EXITED **and** a FORCE_FLAT journal entry carry the cost breakdown (`gross_pnl`, `fees`, `slippage_cost`, net `realized_pnl`), and that the CSV export includes those columns with the expected values. (Asserts FR-006 is actually journaled, not just modeled.)

### Implementation for User Story 1

- [X] T012 [US1] In `backend/src/intraday_trade_spy/broker/paper.py`: accept `BrokerConfig` in `__init__`; apply adverse slippage to entry/stop/target/force-flat fills; compute `gross_pnl`, `fees = fees_per_share·qty·2`, `slippage_cost`, and set `realized_pnl` = net. Preserve the same-bar stop-first rule. (Makes T007–T009 pass.)
- [X] T013 [US1] In `backend/src/intraday_trade_spy/backtest/engine.py` (+ `journal/logger.py` if the CSV column set is fixed there): construct `PaperBroker(cfg.broker)`; thread `gross_pnl`/`fees`/`slippage_cost` through `_log_exit` so the journal **and CSV export** record the cost breakdown (VII). (Makes T010, T011, T011a pass.)
- [X] T014 [US1] In `backend/src/intraday_trade_spy/backtest/metrics.py`: ensure `total_pnl_dollars` sums **net**; add `total_net_pnl_dollars`, `total_fees_dollars`, `total_slippage_dollars`. (TDD-covered by the summary-field assertions added to T009/T010.)

**Checkpoint**: Backtest is net-of-cost and the fixture proves it. **This is the MVP — the honest ruler.**

---

## Phase 4: User Story 2 — Real edge-quality metrics (Priority: P2)

**Goal**: Expectancy, Sharpe/Sortino, drawdown $/%, distribution, equity curve, and per-bucket breakdown — all over net results.

**Independent Test**: Each metric matches its hand-computed value on a known fixture; degenerate inputs return `None` without error.

### Tests for User Story 2 ⚠️ (write first, must FAIL)

- [ ] T015 [P] [US2] In `backend/tests/test_metrics.py`: FAILING tests for expectancy in R `(win%·avg_win_R − loss%·|avg_loss_R|)` and in `$` (mean net per-trade).
- [ ] T016 [P] [US2] In `backend/tests/test_metrics.py`: FAILING tests for the equity curve (seed at `account_value`, length = trades+1) and max drawdown in `$` and `%`.
- [ ] T017 [P] [US2] In `backend/tests/test_metrics.py`: FAILING tests for daily-return Sharpe and Sortino (rf=0, ×√252; daily PnL ÷ `account_value`).
- [ ] T018 [P] [US2] In `backend/tests/test_metrics.py`: FAILING tests for return distribution (median, sample std, Fisher-Pearson skew).
- [ ] T019 [P] [US2] In `backend/tests/test_metrics.py`: FAILING tests for per-bucket breakdown by hour-of-day, weekday, and month-of-year using NY-local entry timestamps (via `clock.py`); bucket counts sum to the trade count.
- [ ] T020 [P] [US2] In `backend/tests/test_metrics.py`: FAILING tests that 0-trade, 1-trade, all-win, and all-loss inputs yield `None` (not `0`/`inf`) for the relevant metrics and raise no exception.

### Implementation for User Story 2 (backend metrics)

- [ ] T021 [US2] In `backend/src/intraday_trade_spy/backtest/metrics.py`: implement expectancy (R and $) and return distribution (median/std/skew). (T015, T018, partial T020.)
- [ ] T022 [US2] In `backend/src/intraday_trade_spy/backtest/metrics.py`: build the equity curve (`EquityPoint` series anchored on `account_value`) and max drawdown in `$` and `%`. (T016.)
- [ ] T023 [US2] In `backend/src/intraday_trade_spy/backtest/metrics.py`: implement daily-return Sharpe and Sortino from `MetricsConfig` (rf, ×√trading_days). (T017.)
- [ ] T024 [US2] In `backend/src/intraday_trade_spy/backtest/metrics.py`: implement per-bucket breakdown (hour/weekday/month, NY tz via `clock.py`). (T019, remaining T020.)

### Implementation for User Story 2 (persistence + API)

- [ ] T025 [P] [US2] In `backend/tests/storage/test_models_run_trade.py` and `backend/tests/storage/test_push_round_trip.py`: FAILING tests that cloud `RunSummary` carries the new scalar fields and `push.py` maps them (real `sharpe`, `sortino`, `expectancy`, new **`max_drawdown_dollars`** + `max_drawdown_pct`, `total_fees`, `total_slippage`, `low_confidence`, CI bounds). **Do NOT repurpose the existing `max_drawdown` field** — it keeps its legacy R meaning (still mapped from `max_drawdown_r`) so pre-010 and post-010 rows are not mixed in different units; assert this in a test.
- [ ] T026 [US2] In `backend/src/intraday_trade_spy/storage/models.py` extend `RunSummary` (add `max_drawdown_dollars`, `max_drawdown_pct`, `sortino`, `expectancy`, `expectancy_dollars`, `total_fees`, `total_slippage`, `low_confidence`, CI bounds; populate real `sharpe`; **leave `max_drawdown` carrying R**), and in `backend/src/intraday_trade_spy/storage/push.py` map the new fields from local `summary.json`. (Makes T025 pass.)
- [ ] T027 [P] [US2] In `backend/tests/api/` (new `test_run_summary_view.py`): FAILING test that `RunSummaryView` exposes the new fields and defaults safely for pre-010 rows.
- [ ] T028 [US2] In `backend/src/intraday_trade_spy/api/schemas.py`: extend `RunSummaryView` with the new fields + safe defaults. (Makes T027 pass.)

### Implementation for User Story 2 (frontend)

- [ ] T029 [P] [US2] In `frontend/src/components/summary-metrics-card.test.tsx`: FAILING/updated tests that new metric Stats (expectancy, Sharpe, Sortino, drawdown $/%, distribution) render with a `HelpTooltip` each.
- [ ] T030 [US2] In `frontend/src/api/legacy-types.ts` (`SummaryMetricsView`) and `frontend/src/api/types.ts` (`RunSummary`): add the new metric fields, equity curve, and bucket arrays.
- [ ] T031 [US2] In `frontend/src/components/summary-metrics-card.tsx`: add the new `Stat` cells with `helpKey`s, and add the matching `HELP_CONTENT` entries (slippage, fees, expectancy, Sharpe, Sortino, drawdown $/%, distribution) in `frontend/src/components/help-content.ts`. (Makes T029 pass.)
- [ ] T032 [P] [US2] In `frontend/src/components/per-bucket-card.test.tsx` (new): FAILING test that a `PerBucketCard` renders hour/weekday/month buckets from a mock summary with a `HelpTooltip`.
- [ ] T033 [US2] Create `frontend/src/components/per-bucket-card.tsx` and mount it in `frontend/src/routes/run-viewer.tsx`; add its `HELP_CONTENT` entry. (Makes T032 pass.)
- [ ] T034 [P] [US2] In `frontend/src/components/equity-curve.test.tsx` (new): FAILING test that an `EquityCurve` SVG sparkline renders from a mock equity series with a baseline and a `HelpTooltip`.
- [ ] T035 [US2] Create `frontend/src/components/equity-curve.tsx` (dependency-free SVG) and mount it in `frontend/src/routes/run-viewer.tsx`; add its `HELP_CONTENT` entry. (Makes T034 pass.)

**Checkpoint**: Full edge-quality metric set is computed, persisted, served, and displayed with tooltips.

---

## Phase 5: User Story 3 — Sample-size & significance signal (Priority: P3)

**Goal**: Every result shows N and a 95% win-rate confidence interval; thin samples are flagged as noise.

**Independent Test**: A 6-trade result is flagged with a wide CI; a several-hundred-trade result has a tight CI and no flag.

### Tests for User Story 3 ⚠️ (write first, must FAIL)

- [ ] T036 [P] [US3] In `backend/tests/test_metrics.py`: FAILING tests for the Wilson 95% win-rate CI bounds (known fixtures) and the `low_confidence` flag = `total_trades < metrics.low_confidence_trade_count`.
- [ ] T037 [P] [US3] In `frontend/src/components/summary-metrics-card.test.tsx`: FAILING tests that N and the CI render, a "noise" badge shows when `low_confidence` is true, and is absent for a large-N summary.

### Implementation for User Story 3

- [ ] T038 [US3] In `backend/src/intraday_trade_spy/backtest/metrics.py`: implement the Wilson CI (`win_rate_ci_low/high`) and `low_confidence`. (Makes T036 pass.)
- [ ] T039 [US3] In `frontend/src/components/summary-metrics-card.tsx`: surface N, the CI, and a "noise" badge; add `HELP_CONTENT` for confidence interval and sample size. (Makes T037 pass.) (View/cloud fields for CI + `low_confidence` were defined in T026/T028/T030.)

**Checkpoint**: No result can be mistaken for significant without seeing its N and CI.

---

## Phase 6: User Story 4 — Config that means what it says (Priority: P4)

**Goal**: Delete the three dead knobs (`min_minutes_after_open`, `require_close_above_prior_bar_high`, `require_close_above_vwap`).

**Independent Test**: The knobs are gone from config/schema; a backtest produces identical results to before removal (they were inert).

### Tests for User Story 4 ⚠️ (write first, must FAIL)

- [ ] T040 [P] [US4] In `backend/tests/test_config.py`: FAILING test that `VwapPullbackConfig` has no `confirmation`/`min_minutes_after_open` and that a config containing them is rejected/ignored as designed.
- [ ] T041 [P] [US4] In `backend/tests/test_vwap_pullback.py`: update the existing tests (the only ones referencing the removed knobs) to construct `VwapPullbackConfig` without them, asserting the hardcoded VWAP + prior-bar confirmations still gate entries (behavior unchanged).

### Implementation for User Story 4

- [ ] T042 [US4] In `backend/src/intraday_trade_spy/config.py`: delete `VwapPullbackConfirmationConfig`, the `confirmation` field, and `min_minutes_after_open`. (Makes T040 pass.)
- [ ] T043 [US4] In `backend/config/config.yaml`: remove the `min_minutes_after_open` and `confirmation:` lines from `strategy.vwap_pullback`. [config — exempt] (With T041, confirms identical behavior.)

**Checkpoint**: Zero parsed-but-ignored knobs remain.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T044 [P] In `frontend/src/components/help-content.ts` tests: add/verify a test asserting every new concept key has non-empty what/why/how content (constitution VI completeness).
- [ ] T045 Run `quickstart.md` end-to-end: the cost fixture test, a full-span net-of-cost run, and `grep -rn "min_minutes_after_open\|require_close_above" backend/src backend/config` returns no hits.
- [ ] T046 Performance check: a full-span backtest (~164,918 bars) still completes in ~5s; metric computation overhead < ~1s. Note result in the run.
- [ ] T047 [P] Update `docs/automated-trading-roadmap.md` (Phase 1 status → done, feature `010` row) once the exit gate is met.
- [ ] T048 Run full suites green: `cd backend && pytest` and `cd frontend && npm test`.

---

## Dependencies & Execution Order

- **Setup (P1)** → **Foundational (P2)** must finish before any story.
- **US1 (P1)** after Foundational — the MVP; no dependency on other stories.
- **US2 (P2)** after Foundational — metrics are most meaningful on US1's net PnL, but tests use fixtures so US2 is independently verifiable.
- **US3 (P3)** after US2 (extends the metrics module + summary card).
- **US4 (P4)** independent of US1–US3 (separate config/strategy surface) — can be done any time after Setup.
- **Polish (P7)** after all targeted stories.

### Within each story
Tests first (must fail) → models → services/metrics → API → frontend. Same-file tasks (e.g., the four `metrics.py` impl tasks T021–T024) are sequential, not `[P]`.

### Parallel opportunities
- Setup: T001 ∥ T002.
- US1 tests T007–T011 all `[P]`.
- US2 metric tests T015–T020 all `[P]`; frontend test-first tasks T029/T032/T034 `[P]`.
- US4 (T040–T043) can run in parallel with US1/US2/US3 by a second developer.

---

## Parallel Example: User Story 1 tests

```bash
# Author these failing tests together (different concerns, shared/adjacent files):
T007 paper-broker slippage      (backend/tests/test_paper_broker.py)
T008 paper-broker fees          (backend/tests/test_paper_broker.py)
T009 cost fixture exact net     (backend/tests/test_cost_fixture.py)
T010 zero-vs-nonzero gap        (backend/tests/test_backtest_engine.py)
T011 lockout uses net pnl       (backend/tests/test_backtest_engine.py)
```

---

## Implementation Strategy

**MVP** = Setup + Foundational + **US1** → a backtest whose every number is net of cost, with a fixture proving it. Stop and validate here; this alone makes downstream tuning honest.

**Incremental**: add US2 (judge edge quality) → US3 (guard against small-sample luck) → US4 (config honesty). Each is an independently testable, deployable increment. US4 can be parallelized.

**Exit gate (spec SC-001…SC-007)** is met when US1+US2+US3 land and the fixture + quickstart checks pass; US4 closes the config-honesty success criterion (SC-005).

---

## Notes

- TDD is non-negotiable (constitution IV): every `backend/src` / `frontend/src` change above has its failing-test task listed first.
- Commit after each task or logical group (Spec Kit auto-commit hooks are available per phase).
- `runs.summary` is JSONB — **no DB migration** is required for any new field.
- Constitution VI: every new UI concept ships with a `HelpTooltip` — enforced by T031/T033/T035/T039/T044.
