# Implementation Plan: Clickable Claude Experiments → Draft Configs

**Branch**: `017-claude-experiment-drafts` | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-claude-experiment-drafts/spec.md`; approved design `docs/superpowers/specs/2026-06-05-claude-experiment-drafts-design.md`

## Summary

Give Claude's suggested experiments a safe path to action: the structured-
output schema gains whitelist-sanitized `suggested_config_changes` (knob path
+ value, validated server-side against a NEW knob registry before storage);
experiment cards render the surviving changes and offer "Draft config →",
which carries a transient draft via a TanStack search param to the Strategies
page, where a badged, pre-filled panel reuses the existing create-config
endpoint — the operator reviews, names, creates, runs. Provenance lands in a
new nullable `configs.description` column (migration 0124). Claude keeps zero
write paths (Constitution II).

## Technical Context

**Language/Version**: Python ≥3.11 (backend), TypeScript + React 18 (frontend)

**Primary Dependencies**: existing only — FastAPI/Pydantic v2, `anthropic` (016), React/Vite/Tailwind, TanStack Router. **No new dependencies.**

**Storage**: migration **0124**: `configs.description TEXT NULL` (provenance home — the configs table has no notes column today); `ClaudeExperiment.suggested_config_changes` rides inside the existing `insight_analyses.analysis` jsonb (additive; old analyses simply lack the key)

**Testing**: pytest (sanitizer with adversarial fixtures; analyst with SDK mocked per 016; configs API contract); vitest + RTL (experiment cards, draft panel, search-param wiring, census)

**Target Platform**: existing Dockerized FastAPI (:8001) + Vite frontend (:5173)

**Performance Goals**: none beyond instant UI — sanitation is O(suggestions), draft travels in the URL

**Constraints**: Constitution II is the spine — analysis pipeline MUST have no create/update path; whitelist enforced BEFORE storage (FR-002); dismiss-draft = no trace (URL-only transport); old analyses render unchanged (FR-008)

**Scale/Scope**: ~5 backend files touched + 1 new module + 1 migration; ~6 frontend files touched + 1 new component; 3 user stories

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source of truth: `.specify/memory/constitution.md` (v1.1.0).

| # | Principle | Touched? | How this plan complies |
|---|-----------|---------|------------------------|
| I | SPY-Only Instrument (NON-NEGOTIABLE) | no | Configs/knobs are SPY-strategy knobs; no instrument surface |
| II | Long-Only, Rule-Based v1 (NON-NEGOTIABLE) | **yes — examined closely** | The LLM still only *suggests*: suggestions are sanitized data inside an advisory analysis. The draft travels in a URL, is never persisted by the pipeline, and a config comes into existence ONLY through the operator's explicit create action on the standard endpoint with standard validation (FR-006/SC-003). The whitelist is enforced server-side and never relies on model compliance (FR-010). No auto-create/activate/run anywhere. 016's "no automated parameter optimization" boundary holds: the operator runs the experiment and judges results |
| III | Risk Manager Has Absolute Veto (NON-NEGOTIABLE) | no | No order/sizing path; created configs face the same risk engine as manual ones |
| IV | Test-First Everywhere (NON-NEGOTIABLE) | yes | Failing tests precede every src change; sanitizer gets adversarial fixtures (off-list paths, out-of-bounds, mixed); SDK fully mocked |
| V | Paper-First, Live Trading Disabled (NON-NEGOTIABLE) | no | configs.mode untouched; `live_auto_enabled` immutable by DB check |
| VI | Educational UI | yes | `claude_experiment_draft` HelpTooltip; badge language teaches the boundary ("Claude suggests — you create"); highlighted deltas show exactly what changed vs base |
| VII | Journal Everything | yes | Provenance is durable: `configs.description` records the originating analysis + experiment; the stored analysis already records what was suggested |

**Engineering standards check:**

- [x] Timezone — untouched.
- [x] Tunables: the knob registry (paths + bounds) is code-registered in ONE module (it *defines* what is tunable); no magic numbers sprinkled — bounds live in the registry only.
- [x] Backend: Python ≥3.11 / FastAPI / Pydantic v2 / pytest.
- [x] Frontend: React + TS + Vite + Tailwind; TanStack search-param precedent followed (sign-in route).

No violations → Complexity Tracking intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/017-claude-experiment-drafts/
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
├── db/migrations/0124_configs_description.sql   # NEW — nullable description (provenance home)
├── src/intraday_trade_spy/
│   ├── validation/knobs.py                      # NEW — THE knob registry: path → (min, max, kind); sanitize_changes()
│   ├── models.py                                # + ConfigChange; ClaudeExperiment.suggested_config_changes (default [])
│   ├── api/
│   │   ├── claude_analyst.py                    # + sanitize step (post-parse, pre-store), prompt knob section,
│   │   │                                        #   payload analysis_schema_version (hash invalidation — research R3)
│   │   ├── schemas.py                           # + description on config create/views
│   │   └── routers/configs.py                   # + description pass-through on create
│   └── storage/client.py                        # create_config(+description)
└── tests/
    ├── validation/test_knobs.py                 # NEW — registry + adversarial sanitation
    ├── api/new/test_claude_analyst.py           # + sanitize-before-store, prompt, schema-version tests
    └── api/new/test_configs_description.py      # NEW — create w/ description contract

frontend/src/
├── api/types.ts                                 # + ConfigChange, experiment field, ConfigRow.description
├── lib/draft-config.ts                          # NEW — encode/decode the draft search param (pure, tested)
├── routes/_authenticated.strategies.tsx         # + validateSearch for ?draft= (sign-in precedent)
├── components/
│   ├── insights/ClaudeReadCard.tsx              # experiment cards: changes as "knob → value" + Draft config →
│   ├── strategies/DraftConfigPanel.tsx          # NEW — badged prefilled panel (base, highlights, name, provenance)
│   ├── strategies/config-manager.tsx            # hosts DraftConfigPanel when a draft is present
│   └── help-content.ts                          # + claude_experiment_draft (census +1)
└── lib/config-knobs.ts                          # labels reused for "knob → value" display
```

**Structure Decision**: web application (existing backend + frontend). One new
backend module (`validation/knobs.py` — neutral home so sensitivity sweeps can
adopt the same registry later), one new frontend component + one pure lib.

## Phase 0: Research → [research.md](./research.md)

All unknowns resolved; two design-doc corrections found while grounding
(no knob registry exists today — 017 creates it; the idempotency hash needs an
explicit schema-version bump to invalidate pre-017 analyses).

## Phase 1: Design & Contracts

- [data-model.md](./data-model.md) — knob registry entries + bounds, ConfigChange/ClaudeExperiment v2, migration 0124 DDL, draft-param payload, TS mirrors
- [contracts/api.md](./contracts/api.md) — changed surfaces (analysis output, configs create) + the frontend route contract
- [quickstart.md](./quickstart.md) — setup, tests, SC-001 walkthrough
- Agent context: CLAUDE.md active plan updated to this file

## Post-Design Constitution Re-Check

Unchanged from the gate above — the design artifacts introduced no new
principle contact. Principle II remains satisfied: sanitation before storage,
URL-only draft transport, operator-gated creation, server-side whitelist.
Complexity Tracking remains empty.
