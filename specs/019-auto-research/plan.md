# Implementation Plan: Automated Strategy Research

**Branch**: `019-auto-research` | **Date**: 2026-06-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-auto-research/spec.md`

## Summary

Three composable layers. (1) A **research CLI** — a new console script wrapping
every existing research endpoint (backfill, walk-forward/sensitivity studies,
pooled gate, significance, Monte Carlo, lockbox, health/recommend/analyze) —
that authenticates as the real operator via the web app's existing email-OTP
path (GoTrue REST: `/auth/v1/otp` → `/auth/v1/verify`), persists the session
locally, auto-refreshes it, and never touches the service-role key. Make
targets wrap the CLI. (2) An **auto-research campaign**: a new backend
orchestrator (FastAPI BackgroundTask, persisted in a new `research_campaigns`
table, migration 0126) that cycles data-freshness → walk-forward → pooled gate
→ recommendation-driven next candidate, recording every candidate in the 018
trial ledger with campaign provenance, applying a **Bonferroni-tightened gate
bar** (CI level `1 − α₀/k`, k = the knob family's recorded trial count), and
halting only at `ready_for_lockbox` / `stop_tuning` / `budget_exhausted` /
`cancelled` / `failed`. It can never spend the lockbox. (3) A **Validation-page
Auto-research section** + per-campaign detail route for launch / live progress
/ cancel / history, with HelpTooltips for every new concept.

## Technical Context

**Language/Version**: Python 3.11 (backend), TypeScript 5 / React 18 (frontend)

**Primary Dependencies**: FastAPI, Pydantic v2, httpx (already a dependency —
used by the CLI for GoTrue + API calls), supabase-py storage client (existing);
frontend: @tanstack/react-router + react-query (existing). **Zero new
dependencies.**

**Storage**: Supabase Postgres. One new migration `0126_research_campaigns.sql`:
new `research_campaigns` table (cycles as JSONB, mirroring the studies
result-JSONB pattern) + 3 nullable provenance columns on
`recommendation_trials` (`campaign_id`, `cycle`, `family`). CLI session file:
`~/.intraday-trade-spy/session.json` (chmod 600).

**Testing**: pytest (backend; existing unit_client/stub_storage harness),
Vitest + Testing Library (frontend). TDD per constitution IV.

**Target Platform**: macOS/Linux terminal (CLI), existing FastAPI service
(:8001), existing web frontend.

**Project Type**: Web application (backend + frontend) + CLI entry point.

**Performance Goals**: Campaign cycle overhead (everything except the studies
themselves) < 5 s; dashboard reflects cycle transitions ≤ 5 s (SC-007, poll
interval 2 s); CLI command startup < 1 s.

**Constraints**: No privileged-credential fallback in the CLI (FR-002); gate
bar monotone non-loosening and recorded per cycle (FR-009/SC-005/SC-006);
lockbox untouchable by campaigns (FR-008/SC-003); one active campaign;
campaign thresholds in `backend/config/config.yaml` under a new `research:`
section (no hardcoded numbers).

**Scale/Scope**: Single operator; campaigns of ≤ ~20 cycles (budget-bounded);
each cycle launches one walk-forward study over the existing ~168k-bar cache.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source of truth: `.specify/memory/constitution.md` (v1.1.0).

| # | Principle | Touched? | How this plan complies |
|---|-----------|---------|------------------------|
| I | SPY-Only Instrument (NON-NEGOTIABLE) | yes | The campaign and CLI only compose existing SPY-validated machinery (studies, backfill, gate); no instrument parameter is exposed anywhere. Knob whitelist (017) contains no symbol knob, so no candidate can leave SPY. |
| II | Long-Only, Rule-Based v1 (NON-NEGOTIABLE) | yes | The campaign is deterministic orchestration over rule-based components; the advisory narrator stays optional + non-actuating (FR-013). No ML/HMM introduced — the Bonferroni schedule is arithmetic, not learning. |
| III | Risk Manager Has Absolute Veto (NON-NEGOTIABLE) | yes | Campaigns only run backtests through the existing engine where the risk manager already vetoes per-trade; candidate knob values pass the 017 `sanitize_changes` bounds before any config is created. |
| IV | Test-First Everywhere (NON-NEGOTIABLE) | yes | All new code lives in `backend/src/` (CLI module, campaign engine, router) and `frontend/src/` — every implementation task in tasks.md will be preceded by a failing-test task. Make targets and config.yaml additions are exempt (config); the console-script entry is a ≤5-line wrapper. |
| V | Paper-First, Live Trading Disabled by Default (NON-NEGOTIABLE) | yes | Campaigns operate exclusively on backtest research (FR-012); no code path touches broker order placement or `live_auto_enabled`. A test asserts a campaign run leaves the lockbox ledger byte-identical (SC-003) and never calls the lockbox endpoint. |
| VI | Educational UI: Every Concept Is Explained | yes | New concepts (campaign, cycle, trial budget, tightened bar, stopping verdicts) each ship a `HelpTooltip` with new HELP_CONTENT keys (FR-017); the campaign detail page shows WHY each cycle ended as it did (gate verdict + bar applied + action chosen). |
| VII | Journal Everything | yes | Every cycle transition emits a journal event (campaign started/cycle stage/verdict/halt) through the existing journal sink; trial-ledger rows carry campaign provenance surviving config deletion (FR-010, mirrors 0125 semantics). |

**Engineering standards check:**

- [x] Timezone: campaign freshness checks reuse the existing coverage/clock
  helpers (`America/New_York`); no new time logic is hand-rolled.
- [x] New limits/thresholds (`research.default_budget`, `research.base_alpha`,
  poll/backfill bounds) live in `backend/config/config.yaml`.
- [x] Backend: Python 3.11 / FastAPI / Pydantic v2 / pytest.
- [x] Frontend: React + TypeScript + Vite (+ design-system CSS in globals.css).

No violations → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/019-auto-research/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── cli.md           # CLI command surface + JSON output contract
│   ├── cli-auth.md      # OTP session flow contract
│   └── research-api.md  # Campaign endpoints
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
backend/
├── config/config.yaml                        # + research: section (budget, base_alpha)
├── db/migrations/0126_research_campaigns.sql # campaigns table + trial provenance cols
├── src/intraday_trade_spy/
│   ├── cli/
│   │   ├── research.py                       # console script: argparse subcommands
│   │   └── session.py                        # OTP login + session file + refresh
│   ├── research/
│   │   ├── __init__.py
│   │   ├── campaign.py                       # cycle engine: freshness→study→gate→act
│   │   ├── bar_schedule.py                   # Bonferroni bar: level(k), family key
│   │   └── naming.py                         # auto-config names (auto<NN>-c<k>-<knob><val>)
│   ├── api/routers/research.py               # /api/research/campaigns CRUD + cancel
│   └── storage/client.py                     # + campaign CRUD, trial provenance cols
└── tests/
    ├── cli/test_session.py · test_research_cli.py
    ├── research/test_campaign.py · test_bar_schedule.py · test_naming.py
    └── api/new/test_research_endpoints.py

frontend/src/
├── api/research.ts · api/types.ts            # campaign types + fetchers
├── hooks/useCampaigns.ts                     # list/status/start/cancel (react-query)
├── components/validation/
│   ├── AutoResearchCard.tsx                  # launch + live progress + cancel
│   └── CampaignsTable.tsx                    # history list
├── components/research/CampaignDetailPage.tsx# per-cycle drill-down
├── components/help-content.ts                # + campaign concept keys
└── routes/_authenticated.validation_.campaigns.$campaignId.tsx

Makefile                                       # research section: wraps the CLI
```

**Structure Decision**: Web-app layout already in place; the feature adds one
backend package (`research/`), one CLI module pair, one router, one frontend
section + detail route — mirroring how 011 (validation) and 018 (recommend)
were laid out.

## Complexity Tracking

No constitution violations to justify.
