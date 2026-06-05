# Tasks: Monte Carlo Path-Risk Analysis

**Input**: Design documents from `/specs/015-monte-carlo/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: MANDATORY (constitution principle IV, v1.1.0). Every task touching
`backend/src/**/*.py` or `frontend/src/**/*.{ts,tsx}` is preceded by a
failing-test task. Exempt here: `backend/config/config.yaml` edits and `*.md`
docs.

**Organization**: grouped by user story (US1 path risk → US2 cone → US3 ruin
→ US4 trust). Stories are sequential increments on the same module/panel but
each ends independently testable per its spec Independent Test.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

No setup tasks — zero new dependencies, zero migrations, no scaffolding
(modules land beside existing significance files). Proceed to Foundational.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the config block every story reads.

- [x] T001 Failing tests: `MonteCarloConfig` defaults (iterations=2000, seed=20260604, ruin_thresholds_pct=[5,10,20], horizon_trades=None, max_cone_steps=200), nesting as `ValidationConfig.monte_carlo`, and YAML round-trip of the `validation.monte_carlo` block, in backend/tests/test_config.py
- [x] T002 Implement `MonteCarloConfig` in backend/src/intraday_trade_spy/config.py (beside `SignificanceConfig` ~:167, wired into `ValidationConfig`) and add the `validation.monte_carlo` block to backend/config/config.yaml (per research.md R5)

**Checkpoint**: config loads — user story work can begin.

---

## Phase 3: User Story 1 - Assess drawdown / path risk of a run (Priority: P1) 🎯 MVP

**Goal**: shuffle-method simulation end-to-end — engine → endpoint → panel
drawdown section on the run detail page.

**Independent Test**: open a completed run with ≥2 trades, click Run
simulation, see the three path-risk distributions (P5–P95 + observed);
repeat → identical numbers; <2-trade run → plain-English refusal.

### Tests for User Story 1 (write first, must fail)

- [x] T003 [P] [US1] Failing unit tests: path-stat primitives on hand-computed 4-trade fixtures — equity path from starting equity; max drawdown in $ (`max(peak − equity)`) and peak-relative %; longest losing streak (zero-PnL breaks streaks); longest underwater period (consecutive trades below prior peak) — per research.md R11, in backend/tests/validation/test_monte_carlo.py
- [x] T004 [US1] Implement path-stat primitives (`equity_path`, `max_drawdown_dollars`, `max_drawdown_pct`, `longest_losing_streak`, `longest_underwater`) in backend/src/intraday_trade_spy/validation/monte_carlo.py
- [x] T005 [US1] Failing unit tests: shuffle simulation — seeded determinism (two calls → identical), terminal-equity constancy self-check (raises on violation), P5/P25/P50/P75/P95 + observed for all four stats, iterations taken from config, `low_confidence` iff trade_count < `metrics.low_confidence_trade_count`, in backend/tests/validation/test_monte_carlo.py
- [x] T006 [US1] Implement shuffle simulation + result models: `MonteCarloDistribution`, `MonteCarloShuffleStats`, `MonteCarloResult` (shuffle, iterations, seed, trade_count, starting_equity, low_confidence; frozen like `SignificanceResult`) in backend/src/intraday_trade_spy/models.py, and `run_shuffle()` + `run_monte_carlo()` composition in backend/src/intraday_trade_spy/validation/monte_carlo.py
- [x] T007 [US1] Failing API contract tests in backend/tests/api/new/test_monte_carlo_api.py (unit_client + mocked storage, pattern of test_validation_api.py): 200 happy-path response shape **at US1 stage (shuffle + reproducibility metadata only — contracts/api.md's full shape incl. cone/terminal_equity/ruin is reached at the US3 checkpoint via T016/T021)**; 404 unknown/not-owned run; 422 fewer-than-2-trades with plain-English reason; 422 no stored trade data; 422 unreadable `config_snapshot.risk.account_value`; byte-identical responses across two calls; NO storage-write or journal calls (spy asserts no side effects — covers amended FR-011)
- [x] T008 [US1] Implement `MonteCarloRequest` in backend/src/intraday_trade_spy/api/schemas.py, `run_monte_carlo_for_run()` in backend/src/intraday_trade_spy/api/validation_lifecycle.py (mirrors `run_significance_for_run` at :297 — `storage.get_run` ownership, `storage.list_trades` net PnLs, snapshot equity parse per research.md R3), and `POST /validation/monte-carlo` endpoint (`response_model=MonteCarloResult`) in backend/src/intraday_trade_spy/api/routers/validation.py
- [x] T009 [P] [US1] Failing component tests: `RunMonteCarloSection` — Run-simulation button triggers POST (mock `computeMonteCarlo`), pending state, error state renders message (QueryClient wrapper, pattern of run-significance-section.test.tsx), in frontend/src/components/validation/run-monte-carlo-section.test.tsx
- [x] T010 [P] [US1] Failing component tests: `MonteCarloPanel` renders the drawdown section from a fixture `MonteCarloResult` — observed/P50/P95 table for all four stats, histogram present, `HelpTooltip` on every US1 concept label, in frontend/src/components/validation/monte-carlo-panel.test.tsx

### Implementation for User Story 1

- [x] T011 [US1] Add `MonteCarloResult`/`MonteCarloRequest` TS types in frontend/src/api/types.ts, `computeMonteCarlo()` in frontend/src/api/validation.ts, `useMonteCarlo()` in frontend/src/hooks/useStudies.ts (mirror `useSignificance` at :105)
- [x] T012 [US1] Implement frontend/src/components/validation/monte-carlo-panel.tsx (drawdown observed/P50/P95 table + hand-rolled SVG histogram per research.md R9) and frontend/src/components/validation/run-monte-carlo-section.tsx (button/loading/error wrapper), plus help-content.ts entries: `monte_carlo_simulation`, `shuffle_method`, `max_drawdown_distribution`, `losing_streak`, `underwater_period`, `mc_iterations_seed` in frontend/src/components/help-content.ts
- [x] T013 [US1] Failing test: run detail page mounts the Monte Carlo section beside the significance section (add or extend the RunDetail test in frontend/src/components/runs/) — **adapted to project precedent**: RunDetail has no test file and heavy hook deps (014's RunStudyBadge mount was likewise covered by component tests + live e2e); mount coverage = section/panel tests + T030
- [x] T014 [US1] Mount `<RunMonteCarloSection/>` in frontend/src/components/runs/RunDetail.tsx (beside `RunSignificanceSection`, ~:212)

**Checkpoint**: US1 fully functional — drawdown risk e2e on any run.

---

## Phase 4: User Story 2 - Project a forward cone of outcomes (Priority: P2)

**Goal**: bootstrap cone + terminal-equity percentiles in engine, response,
and a fan chart in the panel.

**Independent Test**: run a simulation and see the cone with ordered bands
(P5≤P25≤P50≤P75≤P95 at every step) and terminal percentiles; a large run's
cone has ≤200 steps with unchanged sampled values.

### Tests for User Story 2 (write first, must fail)

- [x] T015 [P] [US2] Failing unit tests: bootstrap cone — band ordering at every step; horizon defaults to observed trade count and honors config override; downsampling ≤ `max_cone_steps` always including first and final trade_index; percentile values at sampled steps equal full-resolution values (research.md R7); terminal-equity distribution with observed = starting_equity + sum(pnls); seeded determinism, in backend/tests/validation/test_monte_carlo.py
- [x] T016 [P] [US2] Failing API contract test: response includes `cone` (horizon_trades, steps ≤ max_cone_steps) and `terminal_equity` per contracts/api.md, in backend/tests/api/new/test_monte_carlo_api.py
- [x] T018 [P] [US2] Failing component tests: cone fan chart SVG renders five bands + median line + horizon label from fixture, with `forward_cone` HelpTooltip, in frontend/src/components/validation/monte-carlo-panel.test.tsx

### Implementation for User Story 2

- [x] T017 [US2] Implement bootstrap simulation + cone downsampling in backend/src/intraday_trade_spy/validation/monte_carlo.py, add `MonteCarloConeStep`/`MonteCarloCone` models and `cone`+`terminal_equity` fields to `MonteCarloResult` in backend/src/intraday_trade_spy/models.py, wire through `run_monte_carlo_for_run()` in backend/src/intraday_trade_spy/api/validation_lifecycle.py
- [x] T019 [US2] Implement the cone section (hand-rolled SVG fan chart) in frontend/src/components/validation/monte-carlo-panel.tsx, extend types in frontend/src/api/types.ts, add `forward_cone` entry to frontend/src/components/help-content.ts

**Checkpoint**: US1 + US2 work — drawdown + cone sections live.

---

## Phase 5: User Story 3 - Quantify risk of ruin (Priority: P3)

**Goal**: per-threshold ruin probabilities from the bootstrap paths, shown
inline in the panel.

**Independent Test**: run a simulation and see one probability per configured
threshold with monotone non-increasing values as thresholds deepen.

### Tests for User Story 3 (write first, must fail)

- [x] T020 [P] [US3] Failing unit tests: ruin definition (path ruined iff min equity ≤ starting_equity × (1 − t/100) at any step); one probability per configured threshold in config order; monotonicity P(5%) ≥ P(10%) ≥ P(20%); seeded determinism, in backend/tests/validation/test_monte_carlo.py
- [x] T021 [P] [US3] Failing API contract test: response includes `ruin` list per contracts/api.md, in backend/tests/api/new/test_monte_carlo_api.py
- [x] T023 [P] [US3] Failing component test: ruin row renders a probability per threshold with `risk_of_ruin` HelpTooltip, in frontend/src/components/validation/monte-carlo-panel.test.tsx

### Implementation for User Story 3

- [x] T022 [US3] Implement ruin computation (reusing US2's bootstrap path matrix — no second simulation) in backend/src/intraday_trade_spy/validation/monte_carlo.py, add `MonteCarloRuinPoint` model + `ruin` field in backend/src/intraday_trade_spy/models.py, wire through backend/src/intraday_trade_spy/api/validation_lifecycle.py
- [x] T024 [US3] Implement the ruin row in frontend/src/components/validation/monte-carlo-panel.tsx, extend types in frontend/src/api/types.ts, add `risk_of_ruin` entry to frontend/src/components/help-content.ts

**Checkpoint**: all three result groups live.

---

## Phase 6: User Story 4 - Trust and interpret the numbers (Priority: P4)

**Goal**: in-sample caveat rule, low-confidence badge, tooltip completeness.
(The no-side-effects + reproducibility-metadata half of US4 is already gated
by T007's contract tests.)

### Tests for User Story 4 (write first, must fail)

- [x] T025 [P] [US4] Failing component tests: caveat banner shows iff `run.segment` is not `'validation'`/`'lockbox'` — cases: `'train'` (shows), `null` (shows), `undefined`/plain backtest (shows), `'validation'` (hidden), `'lockbox'` (hidden) per the spec clarification; low-confidence badge renders when `low_confidence: true`; tooltip sweep asserting every concept label in the panel has a `HelpTooltip`, in frontend/src/components/validation/monte-carlo-panel.test.tsx

### Implementation for User Story 4

- [x] T026 [US4] Implement the in-sample caveat banner (copy: in-sample trades → risk estimates optimistic → prefer OOS windows or the lockbox run) + low-confidence badge in frontend/src/components/validation/monte-carlo-panel.tsx, add `mc_in_sample_caveat` entry to frontend/src/components/help-content.ts, pass `segment` from frontend/src/components/runs/RunDetail.tsx

**Checkpoint**: all user stories complete.

---

## Phase 7: Polish & Verification

- [x] T027 [P] Full backend suite green: `PYTHONPATH=. .venv/bin/pytest -q --ignore=tests/api/integration --ignore=tests/test_yfinance_integration.py` from backend/ (548 baseline + new)
- [x] T028 [P] Full frontend suite + types: `npm test` and `npx tsc --noEmit` from frontend/ (3 pre-existing price-chart failures remain the known baseline)
- [x] T029 Rebuild backend container (`docker compose up -d --build backend`) and run quickstart.md API verification: endpoint in OpenAPI, curl determinism check (two identical responses) — **done**: endpoint registered, unauthenticated POST → 401; byte-determinism verified in contract tests (live curl needs the browser session's JWT → folded into T030); SC-001 timing measured: **0.52s** for 3,926 trades × 2,000 iterations (analyze M3)
- [ ] T030 Live e2e per quickstart.md (user-driven in browser): simulate on a walk-forward OOS child (no banner), a train/plain run (banner), verify drawdown/cone/ruin sections + tooltips + low-confidence behavior
- [x] T031 [P] Update docs/research-tooling-uplift.md roadmap table: 015 = monte-carlo (this feature), insights → 016, optional UI lanes → 017

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: blocks everything (config is read by the engine).
- **US1 (Phase 3)**: after Phase 2. Creates the module, endpoint, panel — all later stories extend these files.
- **US2 (Phase 4)**: after US1 (extends `MonteCarloResult`, panel, endpoint composition).
- **US3 (Phase 5)**: after US2 (reuses the bootstrap path matrix).
- **US4 (Phase 6)**: after US1 (panel exists); independent of US2/US3 content but lands last to sweep all tooltips.
- **Polish (Phase 7)**: after all stories.

### Within Each Story

Failing tests strictly before implementation (constitution IV). Engine →
models → lifecycle/endpoint → frontend types/hooks → components → mount.

### Parallel Opportunities

- T003 backend ∥ T009/T010 frontend test authoring (different files).
- Within US2/US3: the three failing-test tasks (engine/API/component) are [P].
- T027 ∥ T028 ∥ T031 in Polish.
- Stories themselves are sequential (same files: monte_carlo.py, models.py, panel) — single-developer flow.

## Implementation Strategy

**MVP = Phase 2 + Phase 3 (US1)**: config + shuffle path-risk end-to-end.
Stop, validate per US1's Independent Test (drawdown distributions on a real
run, determinism, refusal states), then layer US2 → US3 → US4 as independent
increments, each ending at a working checkpoint. Commit after each
test+implementation pair or logical group; e2e (T030) is user-verified in the
browser before merge, per project convention.
