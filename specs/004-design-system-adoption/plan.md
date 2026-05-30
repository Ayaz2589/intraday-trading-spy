# Implementation Plan: Design System Adoption — Intraday Strategy Builder

**Branch**: `004-design-system-adoption` | **Date**: 2026-05-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-design-system-adoption/spec.md`

## Summary

Replace the existing shadcn HSL token system with the design handoff's hex token
system (Plus Jakarta Sans + JetBrains Mono fonts, dark-primary theme, `#2563eb` as the
sole brand/action color, P&L-only green/red), rebuild the app shell as a CSS-grid
layout with a sticky blurred topbar and persisted segmented layout control
(Overview ↔ Chart focus), and restyle every existing component (sidebar, run header,
three overview cards, KLineCharts price chart, trades table, popovers) to the new
visual language while preserving all chart overlays, rationale popovers, click-to-
inspect, routing, and HelpTooltip educational layer. Add three new affordances:
skeleton loading / styled error cards, a run-start toast, and a "Show rejections"
chart overlay with cluster-collapse (`Rej · ×N` per consecutive same-reason cluster).

**Technical approach**: Token system rewrite happens in CSS only — `src/styles/index.css`
gets the design's tokens.css verbatim (theme via `data-theme` attribute on
`<html>`), Tailwind v4 keeps generating utility classes that consume the new
variables. Shell rebuild is a single new top-level component (`AppShell`) that
hosts the existing `RunsSidebar` (restyled) and a new `Topbar`, with React Router
routes mounted underneath. Each existing component gets a parallel TDD-first
restyle pass (tests adjusted only where DOM structure legitimately changes, never
just to chase class-name churn). KLineCharts overlay colors swap to the new token
values via existing style props; no new overlays. New components: `Topbar`,
`AppShell`, `Toast`, `Skeleton`, `ErrorCard`, `RejectionClusterOverlay`,
`SegmentedControl`, `LayoutContext`. Existing primitives in `src/components/ui/`
keep their APIs; CSS classes are rewritten to match the design.

## Technical Context

**Language/Version**: TypeScript 5.x (frontend); Python 3.11 (backend, **untouched**).

**Primary Dependencies**: React 19, Vite 5+, Tailwind CSS v4, `klinecharts@10.0.0-beta2`,
`react-router@7`, `lucide-react`, `@radix-ui/react-{popover,tabs,tooltip,slot}`,
`class-variance-authority`, `clsx`, `tailwind-merge`. **No new runtime
dependencies added** — fonts loaded via `@import` in CSS from Google Fonts.

**Storage**: `localStorage` (browser) for theme + layout preference. No
backend changes; existing FastAPI / JSON / CSV pipeline untouched.

**Testing**: `vitest@2` + `@testing-library/react@16` (component) + `@testing-library/user-event@14`
(interaction). 90 existing frontend tests; this plan adds tests for every new
component and updates queries for restyled components where DOM structure changes
materially (per Principle IV: TDD-first).

**Target Platform**: Desktop / large-tablet browsers (≥860px). Modern evergreen
browsers (Chrome 120+, Safari 17+, Firefox 121+). `backdrop-filter` used with a
solid-bg fallback for older Safari.

**Project Type**: Web application — `frontend/` (this feature) + `backend/`
(unchanged). See Project Structure below.

**Performance Goals**: Theme swap < 200ms (SC-003), layout swap < 300ms (SC-008),
toast latency < 200ms (SC-009), cold-load to first skeleton < 100ms (SC-011),
async sections to data swap < 2s on local fetch (SC-011). 60fps scroll on the
main column.

**Constraints**:
- All P&L colors restricted to `--profit` / `--loss`; one brand blue everywhere
  else (FR-003).
- WCAG AA contrast in both themes (SC-005).
- No existing test assertion changes except where DOM structure legitimately
  changes (SC-006).
- No backend API or data-shape changes (FR-014).
- Routes `/`, `/runs/:run_id` preserved verbatim (FR-013).

**Scale/Scope**: 22 functional requirements; 12 success criteria; ~10 new/
restyled components; 1 shell rewrite; 5 design-system primitives (`Card`,
`Badge`, `Chip`, `Pill`, `SegmentedControl`); 3 new feature components
(`Toast`, `Skeleton`, `ErrorCard`); 1 chart-overlay addition
(`RejectionClusterOverlay`). Estimated 30–50 implementation tasks (see
`/speckit-tasks`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source of truth: `.specify/memory/constitution.md` (v1.1.0). This is a
**frontend-only** feature; the architectural contract (Strategy → Risk → Broker
→ Journal) is untouched.

| # | Principle | Touched? | How this plan complies |
|---|-----------|---------|------------------------|
| I | SPY-Only Instrument (NON-NEGOTIABLE) | no | Visual reskin; no instrument logic touched. The topbar's `SPY · 5m` pill is presentational only. |
| II | Long-Only, Rule-Based v1 (NON-NEGOTIABLE) | no | No strategy / signal / direction code touched. |
| III | Risk Manager Has Absolute Veto (NON-NEGOTIABLE) | no | No backend code or limits touched. All risk values continue to live in `backend/config/config.yaml`; the UI is read-only against the manifest's `config_snapshot`. |
| IV | Test-First Everywhere (NON-NEGOTIABLE) | yes | Every new component (`Topbar`, `AppShell`, `Toast`, `Skeleton`, `ErrorCard`, `SegmentedControl`, `LayoutContext`, `RejectionClusterOverlay`) gets a failing component test BEFORE implementation. Existing components only update test assertions when DOM structure legitimately changes (renamed class doesn't count); style swaps happen invisibly to test queries that target roles, labels, and semantics. The cluster-collapse algorithm gets pure-function unit tests (per the `frontend/src/lib/` pattern used for `journal-markers`, `entry-rationale`, `exit-rationale`, `swing-pivots`). |
| V | Paper-First, Live Trading Disabled by Default (NON-NEGOTIABLE) | no | No mode / broker / order-submission code touched. |
| VI | Educational UI: Every Concept Is Explained | yes | The constitutional requirement that every important concept (VWAP, opening range, stop-loss, take-profit, R multiple, daily drawdown, rejected signal, circuit breaker, paper trading, backtest, slippage, spread) is paired with a `HelpTooltip` is preserved verbatim. The design's `.info-dot` style replaces only the trigger's *visual styling*; the `HelpTooltip` component and its What / Why / How content remain. New concepts introduced by this feature (e.g. the "Show rejections" toggle, the win-rate meter, the segmented Overview ↔ Chart focus control) each ship with a paired `HelpTooltip` covering What / Why / How. |
| VII | Journal Everything | no | No journal write paths touched. The UI continues to read from the existing journal CSV via the existing API. |

**Engineering standards check:**

- [x] Timezone is `America/New_York` for any new time logic; `clock.py` is consulted, not reimplemented. *(No new time logic introduced in this feature. The chart's time axis continues to consume the existing per-bar timestamp data, which is already in the correct timezone.)*
- [x] Any new limits, thresholds, or session times added live in `backend/config/config.yaml`, not in source. *(This feature introduces no new limits or thresholds; UI-only constants like pixel offsets, animation durations, skeleton pulse rates are presentational and live in component code or CSS tokens — these are not "limits, thresholds, or session times" in the constitutional sense.)*
- [x] Backend code is Python ≥3.11 / FastAPI / Pydantic v2 / pytest. *(No backend changes.)*
- [x] Frontend code is React + TypeScript + Vite + Tailwind. *(Confirmed — Tailwind v4 stays; the design's tokens.css is consumed by Tailwind via CSS custom properties.)*

Plan passes the Constitution gate. No violations; no entries required in
**Complexity Tracking**.

## Project Structure

### Documentation (this feature)

```text
specs/004-design-system-adoption/
├── plan.md                  # This file
├── research.md              # Phase 0 output (token mapping, font strategy, KLineCharts theming)
├── data-model.md            # Phase 1 output (UI state shape: theme, layout, toast, rejections)
├── quickstart.md            # Phase 1 output (how to run/preview the restyle locally)
├── contracts/               # Phase 1 output
│   ├── components.md        # Public component API contracts (props, slots, events)
│   ├── tokens.md            # Design-token contract (what each token name MUST resolve to)
│   └── states.md            # State-machine contracts (toast, layout, theme)
├── checklists/
│   └── requirements.md      # Spec quality checklist (from /speckit-clarify)
└── tasks.md                 # Phase 2 output (/speckit-tasks — not created by /speckit-plan)
```

### Source Code (repository root)

This feature touches **`frontend/` only**. The backend tree is shown for context.

```text
frontend/
├── src/
│   ├── App.tsx                            # MODIFIED — mounts new AppShell
│   ├── main.tsx                           # unchanged
│   ├── styles/
│   │   ├── index.css                      # REWRITTEN — design tokens + base styles
│   │   └── tokens.css                     # NEW (or inlined) — token authority, mirrors design handoff
│   ├── components/
│   │   ├── app-shell.tsx                  # NEW — CSS-grid shell (sidebar | main)
│   │   ├── app-shell.test.tsx             # NEW (test-first)
│   │   ├── topbar.tsx                     # NEW — brand + actions + segmented + theme
│   │   ├── topbar.test.tsx                # NEW
│   │   ├── segmented-control.tsx          # NEW — Overview ↔ Chart focus
│   │   ├── segmented-control.test.tsx     # NEW
│   │   ├── toast.tsx                      # NEW
│   │   ├── toast.test.tsx                 # NEW
│   │   ├── skeleton.tsx                   # NEW
│   │   ├── skeleton.test.tsx              # NEW
│   │   ├── error-card.tsx                 # NEW
│   │   ├── error-card.test.tsx            # NEW
│   │   ├── rejection-cluster-overlay.ts   # NEW — KLineCharts overlay registration + cluster algo
│   │   ├── rejection-cluster-overlay.test.ts  # NEW
│   │   ├── runs-sidebar.tsx               # MODIFIED — restyled to design tokens
│   │   ├── run-header.tsx                 # MODIFIED — restyled w/ overline meta + complete badge
│   │   ├── strategy-config-card.tsx       # MODIFIED — accent rail (brand)
│   │   ├── summary-metrics-card.tsx       # MODIFIED — accent rail (info) + win-rate meter
│   │   ├── rejection-breakdown-card.tsx   # MODIFIED — accent rail (warn) + Show-on-chart toggle wired
│   │   ├── price-chart.tsx                # MODIFIED — candle/wick/VWAP/OR/marker palette + rejection layer
│   │   ├── journal-table.tsx              # MODIFIED — filter pill tabs + restyled expand panel
│   │   ├── session-picker.tsx             # MODIFIED — 2-line day-tab cards
│   │   ├── theme-toggle.tsx               # MODIFIED — design-spec'd toggle (pill track + thumb)
│   │   ├── help-tooltip.tsx               # MODIFIED — `.info-dot` trigger style; content unchanged
│   │   ├── preset-picker.tsx              # MODIFIED — restyled popover
│   │   ├── risk-knobs.tsx                 # MODIFIED — restyled popover (Customize)
│   │   ├── run-actions.tsx                # MODIFIED — primary/ghost/danger-ghost
│   │   ├── status-badge.tsx               # MODIFIED — design badge styling
│   │   └── ui/
│   │       ├── button.tsx                 # MODIFIED — CVA variants restyled to tokens
│   │       └── (new primitives if needed: card.tsx, chip.tsx, pill.tsx)
│   ├── lib/
│   │   ├── theme.ts                       # MODIFIED — adds layout-mode hook & persistence
│   │   ├── layout-mode.ts                 # NEW — useLayoutMode() with localStorage
│   │   ├── layout-mode.test.ts            # NEW
│   │   ├── rejection-clusters.ts          # NEW — pure cluster-collapse algorithm
│   │   ├── rejection-clusters.test.ts     # NEW
│   │   ├── toast-controller.ts            # NEW — fireToast() singleton w/ collision policy
│   │   └── toast-controller.test.ts       # NEW
│   └── routes/
│       ├── root.tsx                       # MODIFIED — renders under AppShell
│       └── run-viewer.tsx                 # MODIFIED — layout-mode aware ordering
└── (config files: package.json, tsconfig*.json, vite.config.ts — unchanged
   modulo no new dependencies)

backend/   # UNCHANGED — no edits, no test changes
```

**Structure Decision**: Option 2 (Web application). This feature is entirely
inside `frontend/src/`. The `backend/` tree is referenced for completeness only
and receives no modifications. New components keep one responsibility per file
(per the constitution's engineering standards) and follow the existing kebab-
case naming convention. Pure functions (`rejection-clusters`, `toast-controller`,
`layout-mode`) live in `frontend/src/lib/` alongside their test files, matching
the pattern already used for `entry-rationale`, `exit-rationale`, `swing-pivots`,
and `format`.

## Complexity Tracking

No constitutional violations or tensions. **N/A** — table intentionally empty.
