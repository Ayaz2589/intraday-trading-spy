# Implementation Plan: Recommendation Engine — Config Health + Evidence-Backed Suggestions

**Branch**: `018-recommendation-engine` | **Date**: 2026-06-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/018-recommendation-engine/spec.md`

## Summary

Close the 016/017 loop: a deterministic backend engine computes per-config
OOS **health verdicts** (ok / degrading / failing / insufficient evidence)
and, for unhealthy configs, assembles an **evidence pack** from artifacts the
system already persists (011 sensitivity surfaces, 014 matched-window child
runs, 016 pooled gates + regimes) and derives **ranked, whitelisted knob-delta
candidates** plus gather-more-evidence and stop-tuning recommendations. An
advisory Claude layer (new `scope='recommend'` on the existing analyst)
narrates the pack with cited claims; actuation reuses 017's human-gated
"Draft config →" flow end-to-end. A **trial ledger** (new table) counts
recommendation-originated variants per strategy family for data-snooping
honesty. New backend package `recommend/`, one new router, one migration
(0125), zero new dependencies; deterministic content renders fully with
Claude off.

## Technical Context

**Language/Version**: Backend Python 3.11 (FastAPI, Pydantic v2); Frontend TypeScript (React 18 + Vite + Tailwind v4)

**Primary Dependencies**: Existing only — `anthropic` (016) for the advisory layer, psycopg pool (013) for aggregates. **Zero new dependencies.**

**Storage**: Supabase Postgres. Migration `0125`: `recommendation_trials` table + widen `insight_analyses.scope` CHECK to include `'recommend'`. Health verdicts and evidence packs are computed on demand, not persisted (only analyses and trial rows persist).

**Testing**: pytest (`backend/tests/api/new/` unit_client + stub_storage_client pattern; `backend/tests/storage/` fake-cursor pattern); Vitest + Testing Library (frontend).

**Target Platform**: Existing FastAPI service + Vite SPA (cloud: Supabase + Vercel).

**Project Type**: Web application (backend + frontend), extending existing monorepo.

**Performance Goals**: Health for all configs and a single evidence pack each computed from ≤ a few thousand persisted rows; target < 1.5 s server-side per request (same envelope as existing insights aggregates).

**Constraints**: Determinism — identical archive state must reproduce identical verdicts/candidates/rankings (no wall-clock, no randomness; stable sorts with documented tie-breakers). Advisory layer optional at runtime (unconfigured/paused ⇒ deterministic content unaffected). No new backtest execution anywhere in the feature.

**Scale/Scope**: Single-user research tool; ~2–10 configs, ~10–100 OOS windows, ≤ ~20 sensitivity surfaces. Three user stories; ~2 backend modules + 1 router + 1 migration; ~4 frontend components + 1 hook module.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source of truth: `.specify/memory/constitution.md` (v1.1.0).

| # | Principle | Touched? | How this plan complies |
|---|-----------|---------|------------------------|
| I | SPY-Only Instrument (NON-NEGOTIABLE) | no | No instrument surface. Evidence and candidates derive from persisted SPY runs; configs created via the existing flow inherit its SPY validation. |
| II | Long-Only, Rule-Based v1 (NON-NEGOTIABLE) | yes | The engine is deterministic statistics over persisted results — no ML model is trained or run. The Claude layer is advisory narrative under the 016 precedent: it never sizes, orders, or modifies configs; its knob suggestions are sanitized against the 017 registry and actuated only through the human-gated draft flow. Stop-tuning recommendations reference only *registered* strategies (FR: no strategy code generation). |
| III | Risk Manager Has Absolute Veto (NON-NEGOTIABLE) | no | No trading path is touched. Recommendation surfaces have no write path to orders, runs, or configs (FR-010); drafted configs flow through the unchanged create→risk machinery. |
| IV | Test-First Everywhere (NON-NEGOTIABLE) | yes | All new code lives in `backend/src/intraday_trade_spy/recommend/`, `api/`, and `frontend/src/` — TDD-mandatory. Every implementation task in tasks.md will be preceded by a failing-test task. Determinism gets explicit recompute-and-compare tests (SC-002). |
| V | Paper-First, Live Trading Disabled (NON-NEGOTIABLE) | no | No mode or live-flag surface. Configs created from drafts keep `live_auto_enabled=false` (DB CHECK enforces it). |
| VI | Educational UI: Every Concept Is Explained | yes | New `HelpContentKey` entries + `HelpTooltip`s for: health verdict, recommendation (classes), evidence pack, trial count / data snooping (FR-014). The UI labels the determinism split (FR-013) consistently with 016's presentation. The /docs glossary inherits the new entries automatically. |
| VII | Journal Everything | yes | The trial ledger is itself a durable audit record of recommendation-originated attempts; config creation continues through the existing journaled/audited path. No journal bypass is introduced. |

**Engineering standards check:**

- [x] Timezone: no new time logic; window ranges come from persisted runs. No `clock.py` reimplementation.
- [x] All new thresholds live in `backend/config/config.yaml` under `insights.health` and `insights.recommend` (R1/R3 in research.md) — no hardcoded magic numbers (FR-003).
- [x] Backend: Python 3.11 / FastAPI / Pydantic v2 / pytest.
- [x] Frontend: React + TypeScript + Vite + Tailwind.

**Post-Phase-1 re-check**: PASS — design artifacts introduce no new violations; the only LLM use is the established advisory contract; no trading-path file is modified.

## Project Structure

### Documentation (this feature)

```text
specs/018-recommendation-engine/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── api.md           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
backend/
├── config/config.yaml                          # + insights.health / insights.recommend thresholds
├── db/migrations/
│   └── 0125_recommendation_trials.sql          # NEW: trial ledger + scope CHECK widening
├── src/intraday_trade_spy/
│   ├── recommend/                              # NEW package — deterministic engine
│   │   ├── __init__.py
│   │   ├── health.py                           # verdict: pure fn(archive rows, thresholds)
│   │   ├── evidence.py                         # evidence-pack assembly (no new backtests)
│   │   └── candidates.py                       # deterministic ranked candidates + classes
│   ├── api/
│   │   ├── claude_analyst.py                   # + scope='recommend' payload builder/prompt
│   │   └── routers/recommend.py                # NEW: /api/recommend/health, /api/recommend/pack
│   ├── storage/client.py                       # + trial-ledger CRUD, recommend aggregates
│   └── models.py                               # + HealthVerdict, EvidencePack, Candidate views
└── tests/
    ├── api/new/test_recommend_api.py           # NEW (unit_client + stub storage pattern)
    ├── recommend/                              # NEW: health/evidence/candidates unit tests
    └── storage/test_recommend_storage.py       # NEW (fake-cursor pattern)

frontend/src/
├── api/recommend.ts                            # NEW: API client fns
├── hooks/useRecommend.ts                       # NEW: useConfigHealth, useEvidencePack, …
├── components/recommend/                       # NEW
│   ├── HealthBadge.tsx                         # verdict badge + tooltip (Strategies + panel)
│   ├── RecommendationsPanel.tsx                # Insights panel (verdicts, trial ledger, cards)
│   └── RecommendationCard.tsx                  # class-specific card; knob chips + Draft config →
├── components/strategies/config-list.tsx       # + HealthBadge on the active config row
├── components/insights/InsightsPage.tsx        # + RecommendationsPanel below Claude's read
└── components/help-content.ts                  # + health_verdict, recommendation_classes,
                                                #   evidence_pack, trial_count keys
```

**Structure Decision**: Web application (existing monorepo). The deterministic
engine is a new sibling package `recommend/` next to `validation/` (one
responsibility per module: health / evidence / candidates). The advisory layer
is an extension of the existing `claude_analyst.py` rather than a new client —
one provider integration, one sanitation path, one settings switch. The
Claude generation endpoint is **reused** (`POST /api/insights/claude-analysis`
with `scope='recommend'`), so the new router carries only the deterministic
surfaces.

## Complexity Tracking

No constitution violations to justify. (LLM-advisory use follows the 016
amendment-free precedent: advisory narrative with sanitized, human-gated
suggestions is not trading logic.)
