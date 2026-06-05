# Implementation Plan: Monte Carlo Path-Risk Analysis

**Branch**: `015-monte-carlo` | **Date**: 2026-06-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-monte-carlo/spec.md`; approved brainstorm design `docs/superpowers/specs/2026-06-04-monte-carlo-path-risk-design.md`

## Summary

Add on-demand Monte Carlo path-risk analysis to any completed run: a new pure
seeded-numpy module (`validation/monte_carlo.py`, beside `significance.py`)
computes (1) shuffle-based distributions of max drawdown / losing streak /
underwater period vs. the observed values, (2) a bootstrap forward cone of
equity percentile bands plus terminal-equity percentiles, and (3) risk-of-ruin
probabilities per configured threshold. Exposed via
`POST /api/validation/monte-carlo` (mirroring the significance endpoint:
ownership-checked, computed on demand, never persisted, deterministic) and
rendered as a stacked `MonteCarloPanel` card on the run detail page with an
in-sample caveat for any run whose segment is not `validation`/`lockbox`.
Zero migrations, zero new dependencies.

## Technical Context

**Language/Version**: Python ≥3.11 (backend), TypeScript + React 18 (frontend)

**Primary Dependencies**: FastAPI, Pydantic v2, numpy (existing — no new deps); React + Vite + Tailwind; hand-rolled SVG for histogram/fan chart (equity-curve precedent; klinecharts is OHLC-only)

**Storage**: none new — reads existing `runs` (config_snapshot, segment) and `trades` rows via the storage client; results are never persisted

**Testing**: pytest (`backend/tests/validation/`, `backend/tests/api/new/`), vitest + @testing-library/react (`frontend/src/components/validation/*.test.tsx`)

**Target Platform**: existing Dockerized FastAPI service (:8001) + Vite frontend (:5173)

**Project Type**: web application (backend + frontend)

**Performance Goals**: full simulation (2×2,000 iterations over ≤~4,000 trades) returns in well under SC-001's 10 s — vectorized `np.cumsum` over a (2000, n) matrix is ~64 MB and sub-second

**Constraints**: deterministic output (seeded RNG, fixed iteration count); cone payload ≤200 steps; all parameters in `config.yaml`; no persistence or journal side effects (see research.md R2)

**Scale/Scope**: 1 new backend module + 1 endpoint + 1 frontend panel; ~6 backend files touched, ~7 frontend files touched; no migrations

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source of truth: `.specify/memory/constitution.md` (v1.1.0).

| # | Principle | Touched? | How this plan complies |
|---|-----------|---------|------------------------|
| I | SPY-Only Instrument (NON-NEGOTIABLE) | no | Reads stored trades of existing SPY runs; introduces no instrument surface |
| II | Long-Only, Rule-Based v1 (NON-NEGOTIABLE) | yes | Pure statistical resampling of completed trades — no ML/HMM, no prediction model, no parameter optimization (position-sizing optimization explicitly out of scope) |
| III | Risk Manager Has Absolute Veto (NON-NEGOTIABLE) | no | Read-only analytics; places no orders, sizes no positions, touches no risk path |
| IV | Test-First Everywhere (NON-NEGOTIABLE) | yes | Every implementation task in tasks.md is preceded by a failing-test task; path stats verified against hand-computed fixtures; invariants (shuffle terminal-equity constancy, band ordering, ruin monotonicity, determinism) each get explicit tests |
| V | Paper-First, Live Trading Disabled (NON-NEGOTIABLE) | no | No mode/live code paths touched |
| VI | Educational UI: Every Concept Is Explained | yes | New `HelpTooltip` entries (help-content.ts) for: Monte Carlo simulation, shuffle vs. bootstrap, max-drawdown distribution, losing streak, underwater period, forward cone, risk of ruin, iterations & seed; in-sample caveat banner explains WHY estimates may be optimistic |
| VII | Journal Everything | yes (clarified) | MC is a read-only, deterministic analytics computation — not a trade-lifecycle event (execution/rejection/risk decision/P&L). It matches the significance feature's existing precedent of no journal writes; reproducibility metadata (seed/iterations/trade_count) in every response is the audit trail. Spec FR-011 amended accordingly (research.md R2) |

**Engineering standards check:**

- [x] Timezone — no new time logic (trade ordering comes from stored rows; `clock.py` untouched).
- [x] All new limits/thresholds (`iterations`, `seed`, `ruin_thresholds_pct`, `horizon_trades`, cone step cap) live in `backend/config/config.yaml` under `validation.monte_carlo`.
- [x] Backend: Python ≥3.11 / FastAPI / Pydantic v2 / pytest.
- [x] Frontend: React + TypeScript + Vite + Tailwind.

No violations → no Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/015-monte-carlo/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── api.md           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── config/
│   └── config.yaml                                  # + validation.monte_carlo block
├── src/intraday_trade_spy/
│   ├── config.py                                    # + MonteCarloConfig; ValidationConfig.monte_carlo
│   ├── models.py                                    # + MonteCarloResult & sub-models (frozen, like SignificanceResult)
│   ├── validation/
│   │   └── monte_carlo.py                           # NEW — pure engine: shuffle stats, bootstrap cone, ruin
│   └── api/
│       ├── schemas.py                               # + MonteCarloRequest (run_id)
│       ├── validation_lifecycle.py                  # + run_monte_carlo_for_run() (mirrors run_significance_for_run at :297)
│       └── routers/validation.py                    # + POST /validation/monte-carlo (mirrors significance endpoint at :82)
└── tests/
    ├── validation/test_monte_carlo.py               # NEW — engine unit tests (fixtures, invariants, determinism)
    └── api/new/test_monte_carlo_api.py              # NEW — HTTP contract tests (unit_client + mocked storage)

frontend/src/
├── api/
│   ├── types.ts                                     # + MonteCarloResult types
│   └── validation.ts                                # + computeMonteCarlo()
├── hooks/useStudies.ts                              # + useMonteCarlo() (mirrors useSignificance at :105)
├── components/
│   ├── help-content.ts                              # + monte-carlo help keys
│   ├── runs/RunDetail.tsx                           # mount <RunMonteCarloSection/> beside RunSignificanceSection (:212)
│   └── validation/
│       ├── run-monte-carlo-section.tsx              # NEW — trigger/loading/error wrapper (mirrors run-significance-section.tsx)
│       ├── run-monte-carlo-section.test.tsx         # NEW
│       ├── monte-carlo-panel.tsx                    # NEW — stacked card: drawdown table+histogram, cone SVG, ruin row, caveat
│       └── monte-carlo-panel.test.tsx               # NEW
```

**Structure Decision**: web application (existing backend/ + frontend/ split).
The feature mirrors the significance feature file-for-file: pure engine module
in `validation/`, request flow helper in `validation_lifecycle.py`, thin
router endpoint, panel + section components on the run detail page. No new
directories, no migrations, no storage changes.

## Phase 0 → research.md

All Technical Context items are known (the brainstorm + codebase scan resolved
them); research.md records the decisions and the one spec correction (R2,
journaling parity). No NEEDS CLARIFICATION markers remain.

## Phase 1 → data-model.md, contracts/api.md, quickstart.md

- data-model.md: `MonteCarloConfig` + response model family with validation
  rules and invariants (no DB entities, no migrations).
- contracts/api.md: the single new endpoint, request/response/example/errors.
- quickstart.md: how to run engine tests, exercise the endpoint, and verify
  determinism + the caveat rule in the UI.

## Complexity Tracking

No constitution violations — table intentionally empty.
