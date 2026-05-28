# Implementation Plan: Backtest Viewer UI

**Branch**: `003-backtest-viewer-ui` | **Date**: 2026-05-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-backtest-viewer-ui/spec.md`

## Summary

A single-page web app that visualizes the backtest runs Feature 001
produces and Feature 002's downloaded data feeds. Two halves:

1. **Backend (small)**: a tiny FastAPI module that exposes five
   read-only HTTP endpoints over the on-disk
   `backend/data/backtests/<run-id>/{journal.csv,summary.json,run.yaml}`
   files (plus the bar CSV the run consumed). ~150 lines, no
   database, no auth.
2. **Frontend (new)**: a Vite + React 19 + TypeScript SPA with two
   routes (`/` and `/runs/{run_id}`), styled with Tailwind v4 and
   shadcn/ui, with a lightweight-charts candlestick chart, a
   reusable `HelpTooltip` primitive, and a contract-enforced
   educational tooltip catalog.

The two halves are coupled by the JSON shape of the `/api/*` endpoints
and run side-by-side during development (Vite proxy forwards `/api/*`
to port 8000).

## Technical Context

**Language/Version**: Python 3.11+ (backend) + TypeScript 5.6+ /
Node.js ≥20 (frontend).

**Primary Dependencies**:
- Backend additions: `fastapi>=0.115`, `uvicorn>=0.32` (prod),
  `httpx>=0.27` (dev — for `TestClient`).
- Frontend: `react@19`, `react-dom@19`, `react-router@7`,
  `lightweight-charts@5`, `tailwindcss@4`, `vite@6`, `typescript@5.6`;
  shadcn/ui copy-paste components (no runtime package).
- Frontend dev: `vitest`, `@testing-library/react`,
  `@testing-library/jest-dom`, `happy-dom`, `@vitejs/plugin-react`,
  `eslint@9` (flat config) + plugins.

**Storage**: Filesystem only (reuses Feature 001's
`backend/data/backtests/` layout). No DB, no cache.

**Testing**:
- Backend: pytest + FastAPI `TestClient`. Every endpoint has a
  happy-path test and at least one 404 test (per FR-013). Target:
  100% line coverage on `static_server.py` (per SC-002).
- Frontend: Vitest + React Testing Library + happy-dom. Every
  non-trivial component file has at least one test (per FR-012).
  Target: under 10 seconds full-suite (per SC-005).

**Target Platform**: Backend runs as a local Python process
(macOS/Linux). Frontend runs in modern Chrome / Firefox / Safari.
No deployment target for v1.

**Project Type**: Web app, extending the existing monorepo. Backend
gains one new module; frontend is brand-new (currently a placeholder
README).

**Performance Goals**:
- API server: serve any single run's `/journal` in < 200 ms (the
  largest journal we've seen so far is ~270 rows).
- Frontend: initial page load + first run rendered in < 2 s on a
  developer laptop with the dev server warm.
- Test suite: backend < 2 s, frontend < 10 s.

**Constraints**:
- No backend auth, no sessions, no DB — single-developer local tool.
- No real-time updates — runs are static once written.
- No `fetch()` at module load (FR-014) — all data loading lives
  inside React effects so tests can mock it.
- Constitution principle VI (Educational UI) is load-bearing —
  HelpTooltip + the FR-008 concept contract are the deliverable.

**Scale/Scope**:
- Backend module: ~150 lines + ~80 lines of tests.
- Frontend: ~12 components, ~8 contract concepts, 2 routes, ~600
  lines of TypeScript + ~600 lines of tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source of truth: `.specify/memory/constitution.md` (v1.1.0). For each
principle below, state which parts of this feature touch it and prove
non-violation. If a tension exists, defer the justification to the
**Complexity Tracking** table at the bottom of this plan.

| # | Principle | Touched? | How this plan complies |
|---|-----------|---------|------------------------|
| I | SPY-Only Instrument (NON-NEGOTIABLE) | not touched | This feature is a viewer; no trading, no signals, no orders. The data it reads was already SPY-validated by Feature 001's loader. |
| II | Long-Only, Rule-Based v1 (NON-NEGOTIABLE) | not touched | Read-only viewer. |
| III | Risk Manager Has Absolute Veto (NON-NEGOTIABLE) | not touched | No order placement; nothing executes. |
| IV | Test-First Everywhere (NON-NEGOTIABLE, v1.1.0) | yes | Every backend endpoint preceded by a failing FastAPI `TestClient` test. Every React component file (HelpTooltip, JournalTable, SummaryMetricsCard, RejectionBreakdownCard, RunsSidebar, RunHeader, StatusBadge, PriceChart, SessionPicker, route components) preceded by a Vitest + RTL test. **Exempt**: `main.tsx` (3-line createRoot bootstrap), `lib/utils.ts` (1-line `cn()` shadcn helper), barrel `index.ts` re-exports. |
| V | Paper-First, Live Trading Disabled by Default (NON-NEGOTIABLE) | not touched | No broker, no orders. |
| VI | Educational UI: Every Concept Is Explained | **load-bearing** | The HelpTooltip component is the primary deliverable for this principle. A contract list (`help-content.ts`) enumerates every concept the page exposes; a Vitest DOM walker test asserts each concept in the contract has a paired HelpTooltip rendered (FR-008, SC-003). HelpTooltips MUST follow the three-part *what / why / how* structure. |
| VII | Journal Everything | not touched | Read-only over already-journaled events. |

**Engineering standards check:**

- [x] Timezone: not touched (no new time logic).
- [x] Backend code is Python ≥3.11 / FastAPI / Pydantic-or-stdlib.
- [x] Frontend code is React + TypeScript + Vite + Tailwind — matches the constitution's stated frontend stack.
- [x] No new limits / thresholds / risk parameters added to source — config in `backend/config/config.yaml` is unchanged.

**Gate verdict: PASS.** No NON-NEGOTIABLE violation. No entry in
Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/003-backtest-viewer-ui/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── api-contract.md
│   ├── help-tooltip-contract.md
│   └── ui-routes-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (only new / modified locations)

Existing Features 001 + 002 paths are untouched. New additions only:

```text
intraday-trade-spy/
├── backend/
│   ├── pyproject.toml                                  # MODIFIED — add fastapi, uvicorn, httpx(dev) + new console script
│   ├── src/intraday_trade_spy/
│   │   └── api/                                        # NEW package
│   │       ├── __init__.py
│   │       └── static_server.py                        # NEW — FastAPI app + main() entry point
│   └── tests/
│       └── test_static_server.py                       # NEW — TestClient tests for the 5 endpoints
├── frontend/                                           # POPULATED (was just a placeholder README)
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   ├── postcss.config.js
│   ├── eslint.config.js
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx                                    # ≤5-line wrapper — TDD-exempt
│   │   ├── App.tsx
│   │   ├── routes/
│   │   │   ├── root.tsx
│   │   │   └── run-viewer.tsx
│   │   ├── components/
│   │   │   ├── help-tooltip.tsx + .test.tsx
│   │   │   ├── help-content.ts                         # the concept contract dictionary
│   │   │   ├── runs-sidebar.tsx + .test.tsx
│   │   │   ├── run-header.tsx + .test.tsx
│   │   │   ├── summary-metrics-card.tsx + .test.tsx
│   │   │   ├── rejection-breakdown-card.tsx + .test.tsx
│   │   │   ├── journal-table.tsx + .test.tsx
│   │   │   ├── status-badge.tsx + .test.tsx
│   │   │   ├── price-chart.tsx + .test.tsx
│   │   │   └── session-picker.tsx + .test.tsx
│   │   ├── api/
│   │   │   ├── client.ts + .test.ts
│   │   │   └── types.ts
│   │   ├── lib/
│   │   │   └── utils.ts                                # cn() shadcn helper — TDD-exempt
│   │   └── styles/
│   │       └── globals.css
│   └── test/
│       └── setup.ts                                    # Vitest setup
├── Makefile                                            # MODIFIED — add ui-install, ui-dev, ui-build, ui-server targets
└── .gitignore                                          # MODIFIED — add frontend/node_modules, frontend/dist, frontend/.vite
```

**Structure Decision**: Web-app monorepo (Option 2 from the plan
template). Backend gains one new module; frontend is populated from
scratch.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*(No entries — Constitution Check passed.)*

## Phase 0 — Research

See [research.md](./research.md) for the consolidated decisions on:

1. lightweight-charts wrapped as a React component (imperative-React seam).
2. shadcn/ui adoption pattern (`npx shadcn add ...`, not a runtime dep).
3. HelpTooltip single-source-of-truth dictionary + contract test.
4. FastAPI static server architecture (no DB, ~150 lines).
5. Vite dev-server proxy for `/api/*`.
6. AbortController-based cancelation on run-switch.
7. Tailwind v4 CSS-first config.
8. happy-dom vs jsdom (3-5× speedup).
9. tsc --noEmit separate from build.
10. Constitution principle IV exempt list applied to this feature.

## Phase 1 — Design & Contracts

- Data model: see [data-model.md](./data-model.md).
- API + UI contracts: see [contracts/](./contracts/).
- Developer quickstart: see [quickstart.md](./quickstart.md).

## Phase 2 — Tasks

Generated separately by `/speckit-tasks`. Output lands at
`specs/003-backtest-viewer-ui/tasks.md`.
