# Implementation Plan: Cross-Run Insights, Pooled Study Gate & Advisory Claude Narrative

**Branch**: `016-insights` | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-insights/spec.md`; approved brainstorm design `docs/superpowers/specs/2026-06-05-insights-aggregation-design.md`

## Summary

Productize the wf-rr3 lockbox gate (pooled-OOS bootstrap CIs + pooled Monte
Carlo + sign test, verdict = CI low > 0, persisted into the study's `result`
jsonb; full mode adds per-window permutation tests + Fisher's p as a
background task), add an Insights page (edge time-series + per-config window
distribution via the 013 direct-psycopg aggregate path, new nav item, split
Layout A), and offer an advisory Claude narrative on both surfaces (official
`anthropic` SDK, `claude-opus-4-8`, structured cited-claims via
`messages.parse()`, snapshot-pinned + idempotent-by-hash, billing-pause kill
switch). One migration (0123: `insight_analyses` + `insight_settings`), one
new dependency (`anthropic`).

## Technical Context

**Language/Version**: Python ≥3.11 (backend), TypeScript + React 18 (frontend)

**Primary Dependencies**: FastAPI, Pydantic v2, numpy, psycopg/psycopg-pool (existing); **NEW: `anthropic` (official SDK)**; React + Vite + Tailwind; hand-rolled SVG charts (new line/scatter component, equity-curve precedent)

**Storage**: existing `validation_studies.result` jsonb (additive `pooled_gate` key, read-modify-write — see research R2); **migration 0123**: `insight_analyses` + `insight_settings` (RLS, per the 0110 policy pattern); insights aggregates read-only via `db_pool` (SUPABASE_DB_URL)

**Testing**: pytest (engine fixtures incl. the 2026-06-05 worked examples; API contract via unit_client + mocked storage; psycopg aggregates per the 013 test pattern); vitest + @testing-library/react; the Anthropic SDK is **fully mocked** in all tests

**Target Platform**: existing Dockerized FastAPI (:8001) + Vite frontend (:5173); `ANTHROPIC_API_KEY` server-side env only

**Project Type**: web application (backend + frontend)

**Performance Goals**: fast gate < 10 s (SC-002; measured engines: pooled bootstrap ~0.1 s + pooled MC ~0.5 s at 2.6k trades); full gate ≈ 12 × 3 s background; insights aggregates single SQL round-trips

**Constraints**: gate fully seeded → byte-identical recompute (SC-003); SC-001 pins the wf-rr3 verdict; Claude strictly advisory/manual (FR-013), idempotent by payload hash (SC-006), graceful degradation (SC-007)

**Scale/Scope**: ~7 backend files touched + 3 new modules + 1 migration; ~10 frontend files incl. 1 new page/route/nav entry + 4 new components; 4 user stories

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source of truth: `.specify/memory/constitution.md` (v1.1.0).

| # | Principle | Touched? | How this plan complies |
|---|-----------|---------|------------------------|
| I | SPY-Only Instrument (NON-NEGOTIABLE) | no | Aggregates and narratives over existing SPY runs; no instrument surface |
| II | Long-Only, Rule-Based v1 (NON-NEGOTIABLE) | **yes — examined closely** | The gate is classical statistics (bootstrap/sign/Fisher), not ML. The LLM is strictly **advisory and outside the trading loop**: manual trigger only (FR-013), reads already-computed statistics, output is narrative + suggested *experiments for the operator*; it has **no write path** into strategies, configs, risk parameters, or order flow, and no scheduled invocation. Strategy modules remain rule-based and untouched. No automated parameter optimization (explicitly out of scope) |
| III | Risk Manager Has Absolute Veto (NON-NEGOTIABLE) | no | Read-only over persisted runs; no order/sizing path touched |
| IV | Test-First Everywhere (NON-NEGOTIABLE) | yes | Every implementation task preceded by a failing test; engine stats locked to hand-computed + the 2026-06-05 worked examples (sign 9/12 → 0.0730; Fisher X²=85, df=24 → 9.5e-9); Anthropic SDK fully mocked; billing-pause flip has explicit tests |
| V | Paper-First, Live Trading Disabled (NON-NEGOTIABLE) | no | No mode/live paths touched |
| VI | Educational UI | yes | HelpTooltips: pooled gate, sign test, Fisher combined p, edge time-series, window distribution, Claude advisory, snapshot pinning; the findings table (claim ↔ cited metric from our data) is itself an educational device; determinism split labeled in UI |
| VII | Journal Everything | yes (clarified) | No journal writes — read-only analytics, same precedent as significance/MC (015 R2). The durable record is `insight_analyses` rows (what was generated, from which snapshot, by which model) and the persisted `pooled_gate` verdict with `computed_at` |

**Engineering standards check:**

- [x] Timezone — no new time logic; window ordering comes from stored run ranges.
- [x] All new tunables in `backend/config/config.yaml`: `validation.pooled_gate` (alpha, seed offsets), `insights.claude` (model, max_timeseries_windows, max_tokens).
- [x] Backend: Python ≥3.11 / FastAPI / Pydantic v2 / pytest.
- [x] Frontend: React + TypeScript + Vite + Tailwind; charts hand-rolled SVG (constitution permits Recharts but no new dep needed).

No violations → Complexity Tracking intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/016-insights/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── api.md           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── pyproject.toml                                   # + anthropic
├── config/config.yaml                               # + validation.pooled_gate, insights.claude
├── migrations/0123_insight_analyses.sql             # NEW — insight_analyses + insight_settings + RLS
├── src/intraday_trade_spy/
│   ├── config.py                                    # + PooledGateConfig, InsightsClaudeConfig (+ Config.insights)
│   ├── models.py                                    # + PooledGateResult family, ClaudeAnalysis family
│   ├── validation/
│   │   └── pooled.py                                # NEW — pure: pooling, sign test, Fisher, gate rule
│   ├── api/
│   │   ├── claude_analyst.py                        # NEW — payload builders, hash, SDK call, parse, store, settings
│   │   ├── validation_lifecycle.py                  # + gather_pooled_oos(), run_pooled_gate fast/full, RMW result write, in-process guard
│   │   ├── schemas.py                               # + request/response schemas
│   │   └── routers/
│   │       ├── validation.py                        # + POST /studies/{id}/pooled-gate
│   │       └── insights.py                          # NEW — timeseries, distribution, claude-analysis, claude-settings
│   └── storage/client.py                            # + insights_edge_timeseries(), insights_config_distribution(),
│                                                    #   insert/get insight_analyses, get/upsert insight_settings
└── tests/
    ├── validation/test_pooled.py                    # NEW — engine fixtures + worked examples
    ├── api/new/test_pooled_gate_api.py              # NEW — gate HTTP contract
    ├── api/new/test_insights_api.py                 # NEW — aggregates + claude endpoints contract
    └── api/new/test_claude_analyst.py               # NEW — SDK mocked: hash/idempotency/billing-pause

frontend/src/
├── api/types.ts                                     # + TS mirrors
├── api/insights.ts                                  # NEW — API client fns
├── hooks/useInsights.ts                             # NEW — queries/mutations (retry: false on mutations)
├── components/
│   ├── side-nav.tsx                                 # + Insights item (nav-icons.tsx: + InsightsIcon)
│   ├── help-content.ts                              # + 7 new keys
│   ├── charts/line-scatter.tsx                      # NEW — reusable SVG series chart (edge time-series)
│   ├── insights/                                    # NEW dir
│   │   ├── InsightsPage.tsx                         # split Layout A
│   │   ├── EdgeTimeseries.tsx
│   │   ├── ConfigDistribution.tsx
│   │   └── ClaudeReadCard.tsx                       # shared (also used on study detail)
│   └── validation/
│       ├── PooledGatePanel.tsx                      # NEW — verdict banner, stats, MC strip, full-gate button
│       └── StudyDetailPage.tsx                      # mount panel between StudyStatCards and WindowRows (~:52)
└── routes/_authenticated.insights.tsx               # NEW route (TanStack file route)
```

**Structure Decision**: web app (existing split). Pure statistics in
`validation/pooled.py` (mirrors significance/monte_carlo); request/task
orchestration in `validation_lifecycle.py`; all Claude specifics isolated in
`api/claude_analyst.py` so the rest of the system has zero SDK awareness;
insights SQL lives as storage-client methods on the shared `db_pool`
(`bars_monthly_aggregate` precedent).

## Phase 0 → research.md

All unknowns resolved by codebase grounding; research.md records 11 decisions
including two corrections to the design doc (migration number 0123, not 0120;
read-modify-write for the result jsonb since `update_validation_study`
replaces the whole dict).

## Phase 1 → data-model.md, contracts/api.md, quickstart.md

- data-model.md: `pooled_gate` jsonb shape, migration 0123 DDL shape, response
  model families, TS mirrors, invariants.
- contracts/api.md: the new endpoints (1 validation + 6 insights), examples,
  errors.
- quickstart.md: env/migration setup, test commands, SC-001 reproduction
  walkthrough.

## Complexity Tracking

No constitution violations — table intentionally empty.
