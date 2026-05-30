---

description: "Task list for feature 004: Design System Adoption"
---

# Tasks: Design System Adoption — Intraday Strategy Builder

**Input**: Design documents from `/specs/004-design-system-adoption/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/{tokens,components,states}.md, quickstart.md

**Tests**: Per constitution principle IV (Test-First Everywhere, NON-NEGOTIABLE,
v1.1.0), tests are MANDATORY for every task touching `frontend/src/**/*.{ts,tsx}`.
The failing-test task MUST precede the implementation task for the same file or
the same behavior. The constitution's exempt list applies only to: config files
(YAML/TOML/INI/JSON/dotenv), `*.md` docs, `.gitignore` / `.python-version`,
≤5-line entry-point wrappers, type stubs, and generated code.

`frontend/src/styles/globals.css` is
**CSS configuration** — it is part of the design-token contract and has
its own pure-function test (`tokens.test.ts`) that validates the contract.
The token test is the test-first artifact for that file.

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing. Within each story, test tasks precede their
implementation tasks.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (US1, US2, US3); omitted in Setup, Foundational, and Polish phases

## Path Conventions

This is a **web application**. All work happens in `frontend/src/`. The
`backend/` tree is untouched. Paths are project-relative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: CSS-token rewrite and font/foundation plumbing. Pure configuration
work; no React component touched yet.

- [X] **T001** Add Google Fonts `@import` for `Plus Jakarta Sans` (400/500/600/700/800) and `JetBrains Mono` (400/500/600/700) with `&display=swap` at the top of `frontend/src/styles/globals.css` (per research R3).
- [X] **T002** Failing token-resolution test: create `frontend/src/styles/tokens.test.ts` that reads `getComputedStyle(document.documentElement).getPropertyValue('--token-name')` for every token in `contracts/tokens.md` and asserts the expected value for `[data-theme="dark"]` and `[data-theme="light"]`. Run with `vitest`; MUST fail before T003.
- [X] **T003** Implement the design's token system in `frontend/src/styles/globals.css`: replace the existing shadcn `:root` HSL block with the handoff's `tokens.css` content verbatim (theme via `[data-theme="dark"|"light"]`). Preserve the existing `@import "tailwindcss"` line; remove the existing `@custom-variant dark (&:where(.dark, .dark *))` and replace with `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *))` (per research R9). Add the body / scrollbar base rules from the handoff. Confirm T002 now passes.
- [X] **T004** [P] Add `@supports not (backdrop-filter: blur(1px))` fallback rule to `frontend/src/styles/globals.css` that sets the topbar background to opaque `var(--bg-app)` in browsers lacking blur support (per research R12).
- [X] **T005** [P] Add `.theme-no-anim *, .theme-no-anim *::before, .theme-no-anim *::after { transition: none !important; }` to `frontend/src/styles/globals.css` (per research R2).

**Checkpoint**: tokens resolve correctly in both themes; fonts load; backdrop-filter fallback in place. No React components yet rely on the new tokens (they still use shadcn HSL utilities), which means the app will look broken between T005 and the foundational phase. That's expected — the next phase fixes it.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure-function libraries that every user story consumes, plus the
test-audit pass that prevents existing tests from breaking on restyle.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] **T006** Test-audit pass: in every `frontend/src/components/*.test.tsx` and `frontend/src/routes/*.test.tsx` file, convert queries that target class names or inline styles into semantic queries (`getByRole`, `getByLabelText`, `getByText`, etc.). Do NOT change any assertion's *meaning*; only swap the query. After this task, the suite passes against the current (un-restyled) app. Per research R10.
- [X] **T007** [P] Failing tests for `useTheme()` in `frontend/src/lib/theme.test.ts`: cover T-THEME-1 through T-THEME-4 per `contracts/states.md`. MUST fail before T008.
- [X] **T008** Update `frontend/src/lib/theme.ts` to set `data-theme` attribute (not class) on `document.documentElement`, persist to `localStorage["isb-theme"]`, and add/remove `.theme-no-anim` for 2 rAF on flip. Confirm T007 passes.
- [X] **T009** [P] Failing tests for `useLayoutMode()` in `frontend/src/lib/layout-mode.test.ts`: cover T-LAYOUT-1 through T-LAYOUT-4 per `contracts/states.md`. MUST fail before T010.
- [X] **T010** Implement `frontend/src/lib/layout-mode.ts` exporting `useLayoutMode()` hook with `LayoutMode = "overview" | "focus"`, `localStorage["isb-layout"]` persistence, default `"overview"`. Confirm T009 passes.
- [X] **T011** [P] Failing tests for `fireToast()` controller in `frontend/src/lib/toast-controller.test.ts`: cover T-TOAST-1 through T-TOAST-4 per `contracts/states.md`. MUST fail before T012.
- [X] **T012** Implement `frontend/src/lib/toast-controller.ts` as a module-level subscribable store: `fireToast(message)`, `subscribe(fn)`, `getSnapshot()`. Replace-policy (new fire resets timer + message). 2.2s default dismiss. Confirm T011 passes.
- [X] **T013** [P] Failing tests for `clusterRejections()` in `frontend/src/lib/rejection-clusters.test.ts`: cover T-CLUSTER-1 through T-CLUSTER-6 per `contracts/states.md`. MUST fail before T014.
- [X] **T014** Implement `frontend/src/lib/rejection-clusters.ts` exporting `clusterRejections(rows, bars): RejectionCluster[]` per the algorithm in research R5 and the invariants in `contracts/states.md`. Confirm T013 passes.

**Checkpoint**: All foundational hooks and pure functions exist and are tested. The existing app still uses shadcn-styled components on top of design tokens (visually broken). User stories now unblock — US1 fixes the visual layer.

---

## Phase 3: User Story 1 — Cohesive visual reskin (Priority: P1) 🎯 MVP

**Goal**: Every surface of the dashboard adopts the new design system: shell,
sidebar, topbar (without the segmented control — that's US2), run header, the
three overview cards (with accent rails + win-rate meter + mini-legend), the
KLineCharts price chart (palette restyle, all existing overlays preserved), the
trades table (filter pill tabs + 3-column expanded detail), all popovers
(Presets, Customize, HelpTooltip), the theme toggle, and the loading / error
states for every async section.

**Independent Test**: With only US1 shipped, the user opens the dashboard,
verifies every surface matches the handoff's reference screens (dark + light),
exercises every existing feature (run select, session switch, trade-row
expand, preset, customize knobs, theme toggle, chart overlays, entry/exit dot
rationale popovers), and confirms no existing capability has regressed. The
layout is fixed Overview order — the segmented control is not yet present.

### Implementation for User Story 1

#### Shell + topbar (sans segmented control)

- [X] **T015** [P] [US1] Failing tests for `<AppShell>` in `frontend/src/components/app-shell.test.tsx`: three slots (`sidebar`, `topbar`, `children`), `children` is the only `overflow-y:auto` region, sidebar hidden at ≤860px, **stat-row container's CSS grid collapses to 2 columns at ≤1180px with the Rejections card spanning both columns** (FR-012, fixes analyze finding U1). Per `contracts/components.md`.
- [X] **T016** [US1] Implement `frontend/src/components/app-shell.tsx` per the handoff's `.app` / `.main` / `.main-scroll` CSS. Render `<aside>` → sidebar slot, `<main>` → topbar slot + scroll region wrapping `children`. Use the design's CSS-grid `252px 1fr` and the ≤860px responsive collapse.
- [X] **T017** [P] [US1] Failing tests for `<Topbar>` (without segmented control) in `frontend/src/components/topbar.test.tsx`: brand mark + wordmark + ticker pill, action buttons fire handlers, theme toggle reflects current theme. Per `contracts/components.md`.
- [X] **T018** [US1] Implement `frontend/src/components/topbar.tsx` rendering brand block + action buttons (New backtest, Delete run, Delete all, Presets, Customize) + theme toggle, styled per the handoff. Segmented control is NOT yet rendered (US2 adds it). Mount existing `RunActions`, `PresetPicker`, `RiskKnobs`, `ThemeToggle` inside.
- [X] **T019** [US1] Update `frontend/src/App.tsx` and `frontend/src/routes/run-viewer.tsx` to mount the new `<AppShell>` and `<Topbar>` as the page chrome (replacing the inline flex chrome currently in `run-viewer.tsx`). Routes (`/`, `/runs/:run_id`) unchanged.

#### Primitives + foundational components

- [X] **T020** [P] [US1] Failing tests for `<Skeleton>` in `frontend/src/components/skeleton.test.tsx`: renders with `role="presentation"`, accepts width/height/rounded props, includes pulse animation class.
- [X] **T021** [P] [US1] Implement `frontend/src/components/skeleton.tsx` per `contracts/components.md` (CSS pulse 1.4s between `--surface-2` and `--surface-3`; `aria-hidden="true"`).
- [X] **T022** [P] [US1] Failing tests for `<ErrorCard>` in `frontend/src/components/error-card.test.tsx`: renders `message` verbatim, has `role="alert"`, applies `--loss` accent.
- [X] **T023** [P] [US1] Implement `frontend/src/components/error-card.tsx` per `contracts/components.md`.
- [X] **T024** [P] [US1] Restyle existing `frontend/src/components/ui/button.tsx`: update CVA variants to the design's `.btn` / `.btn-primary` / `.btn-ghost` / `.btn-danger-ghost` / `.btn-sm` styling (consume `--accent`, `--surface-2`, `--surface-hover`, etc.). No API changes — variants keep their names. Re-run any `button.test.tsx` after.

#### HelpTooltip restyle (Principle VI compliance)

- [X] **T025** [US1] Restyle `frontend/src/components/help-tooltip.tsx` trigger to the design's `.info-dot` style (13×13 px circle, `1px solid var(--border-strong)`, font-size 8.5px, font-weight 700, `--text-faint` foreground). Tooltip popover content layout uses design tokens (`--surface`, `--shadow-pop`, `--r-lg`). API unchanged; `frontend/src/components/help-tooltip.test.tsx` should still pass after T006's audit.

#### Sidebar

- [X] **T026** [US1] Failing test additions for `<RunsSidebar>` in `frontend/src/components/runs-sidebar.test.tsx`: footer mini-legend (FR-015) renders two dots (VWAP amber, OR hi/lo green); each `.run-item` has P&L badge with `--profit` or `--loss` per sign; active row has `aria-current="page"`; **re-rendering with a different `runs` length updates the count pill text** (FR-020, fixes analyze finding U3).
- [X] **T027** [US1] Restyle `frontend/src/components/runs-sidebar.tsx` per the handoff's `.sidebar` block: rounded run-item cards with run-id (mono 11.5px 600), timestamp (faint), P&L badge color-coded, trade count `Nt`. Add footer mini-legend element. Active row uses `--surface` + `--border-accent` + `--shadow-sm`.

#### Run header

- [X] **T028** [US1] Failing test additions for `<RunHeader>` in `frontend/src/components/run-header.test.tsx`: title rendered as `<h1>`; "complete" profit-badge appears inline with title; meta row shows `Started`, `Code`, `Data` as overline labels with mono values, separated by tiny dot dividers.
- [X] **T029** [US1] Restyle `frontend/src/components/run-header.tsx` per the handoff's `.run-header` block.

#### Overview cards (with accent rails)

- [X] **T030** [P] [US1] Failing test additions for `<StrategyConfigCard>` in `frontend/src/components/strategy-config-card.test.tsx`: card has `--accent` color accent rail before title; chip `VWAP Pullback` rendered to the right; 3-column grid; "Setup" item spans 2 columns.
- [X] **T031** [P] [US1] Restyle `frontend/src/components/strategy-config-card.tsx` per the handoff's `.config-grid` + `.card-accent` styling.
- [X] **T032** [P] [US1] Failing test additions for `<SummaryMetricsCard>` in `frontend/src/components/summary-metrics-card.test.tsx`: card has `--info` accent rail; 4-column stat grid; win-rate meter rendered as `role="progressbar"` with `aria-valuenow={winRate}` and `aria-valuemin={0}` `aria-valuemax={100}`.
- [X] **T033** [P] [US1] Restyle `frontend/src/components/summary-metrics-card.tsx` per the handoff's `.summary-grid` + `.win-meter` styling. Win-rate meter spans full width; fill uses `linear-gradient(90deg, var(--accent), var(--info))`.
- [X] **T034** [P] [US1] Failing test additions for `<RejectionBreakdownCard>` in `frontend/src/components/rejection-breakdown-card.test.tsx`: card has `--warn` accent rail; each row renders reason + amber bar + count; "Show on chart" button accepts `onToggle` prop and reflects `show` state with `aria-pressed`.
- [X] **T035** [P] [US1] Restyle `frontend/src/components/rejection-breakdown-card.tsx` per the handoff's `.rej-list` styling; add `show: boolean` + `onToggle: () => void` props (the wiring to the chart's overlay happens in US3, but the props are added now so the API is stable for US1).

#### Price chart (palette restyle + KLineCharts theming)

- [X] **T036** [US1] Failing test for token-driven chart palette: extend `frontend/src/components/price-chart.test.tsx` with assertions that the chart's candle / VWAP / OR colors update when `data-theme` switches dark → light (probe via DOM `style` of the chart container or via a `resolveToken` spy). MUST fail before T037. (Per Principle IV; fixes analyze finding C1 — test-first ordering swap.)
- [X] **T037** [US1] Update `frontend/src/components/price-chart.tsx`: introduce a `resolveToken(name: string): string` helper that reads `getComputedStyle(document.documentElement).getPropertyValue(name).trim()`. Rewire all hardcoded hex colors in candle/wick (`#10b981` / `#ef4444`), VWAP indicator (`#f59e0b` → `--warn`), OR-Hi/Lo (`#22c55e` / `#dc2626` → `--profit` / `--loss`), entry-dot border (`#f59e0b` → `--accent`), exit-dot border, last-close marker, and tradeRationaleTag colors to consume tokens via the helper. Subscribe to theme via `useTheme()` so colors refresh on theme change. **Verify all existing chart-interaction tests in `price-chart.test.tsx` (candle click → bar inspector, dot click → rationale popover, hover OHLC tooltip) continue to pass after the swap — these are FR-018 contracts and must not regress** (fixes analyze finding U2). Confirm T036 now passes.

#### Session picker

- [X] **T038** [P] [US1] Failing test additions for `<SessionPicker>` in `frontend/src/components/session-picker.test.tsx`: each tab renders two lines (weekday abbrev + short date); active tab uses `--accent-soft` background; tabs render correctly when only one session exists.
- [X] **T039** [P] [US1] Restyle `frontend/src/components/session-picker.tsx` to 2-line day-tab cards per the handoff's `.day-tab` styling.

#### Trades table

- [X] **T040** [US1] Failing test additions for `<JournalTable>` in `frontend/src/components/journal-table.test.tsx`: filter tabs render as pill buttons with count badges; active tab uses solid `--accent` background with white text; expanded detail panel shows three section headings (`Indicator snapshot`, `Planned trade`, `Outcome`); detail has `--accent` left accent rail; "Full reason" spans all 3 columns.
- [X] **T041** [US1] Restyle `frontend/src/components/journal-table.tsx` per the handoff's `.filter-tabs` + `.trades` + `.trade-detail` styling. Restructure expanded detail to the 3-column grid + full-width reason row.

#### Theme toggle

- [X] **T042** [P] [US1] Failing test additions for `<ThemeToggle>` in `frontend/src/components/theme-toggle.test.tsx`: button has `aria-label="Toggle theme"`; in dark, thumb sits at `translateX(0)` with moon glyph; in light, thumb sits at `translateX(22px)` with sun glyph.
- [X] **T043** [P] [US1] Restyle `frontend/src/components/theme-toggle.tsx` to the design's `.tt-track` + `.tt-thumb` pill toggle.

#### Popovers + remaining components

- [X] **T044** [P] [US1] Restyle `frontend/src/components/preset-picker.tsx` to the handoff's `.preset-pop` styling (340px width, `.preset-item` rows with leading square icon tile, mono name, description, faint path).
- [X] **T045** [P] [US1] Restyle `frontend/src/components/risk-knobs.tsx` to the handoff's `.knobs-pop` styling (380px width, `.knob` rows with label + field with mono input + suffix, `.knob-foot` with Revert ghost + Run primary).
- [X] **T046** [P] [US1] Restyle `frontend/src/components/run-actions.tsx` to use the design's button variants (primary, ghost, danger-ghost).
- [X] **T047** [P] [US1] Restyle `frontend/src/components/status-badge.tsx` to the design's `.badge` + `.badge-dot` styling; verify color mapping (Emitted=info, Executed=profit, Exited=warn, Rejected=loss, Lockout=faint, ForceFlat=accent).

#### Loading / error states

- [X] **T048** [US1] Refactor `frontend/src/routes/run-viewer.tsx`'s `<Section>` component: replace the `Loading…` text branch with shape-matched `<Skeleton>` placeholders per section (run header skeleton, three card skeletons, chart skeleton, trades table skeleton, sidebar skeleton — all sized to approximate their loaded shape per research R7). Replace the `Error:` text branch with `<ErrorCard message={state.error} />`.
- [X] **T049** [US1] Update `frontend/src/routes/run-viewer.test.tsx` to assert skeleton presence in loading state and `<ErrorCard>` presence in error state; preserve all existing assertions.

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently. The dashboard adopts the new design system end-to-end; every existing feature works; every existing test passes; new behaviors (win-rate meter, mini-legend, accent rails, skeletons, error cards) have their own tests.

---

## Phase 4: User Story 2 — Layout variants for chart-first workflows (Priority: P2)

**Goal**: Add the topbar segmented control (Overview ↔ Chart focus), wire it
through to the content reorder, and persist the preference via `localStorage`
(per the clarification in Q1).

**Independent Test**: With US1 + US2 shipped, the user clicks "Chart focus" in
the topbar; the chart card reorders above the stat row; stat row becomes 3
equal columns. Clicking "Overview" returns to default. Reloading the page
restores the last layout choice.

### Implementation for User Story 2

- [X] **T050** [P] [US2] Failing tests for `<SegmentedControl>` in `frontend/src/components/segmented-control.test.tsx`: container has `role="radiogroup"` + `aria-label` prop; each option has `role="radio"` + `aria-checked`; keyboard arrows move selection; selection fires `onChange`.
- [X] **T051** [US2] Implement `frontend/src/components/segmented-control.tsx` per `contracts/components.md`.
- [X] **T052** [US2] Failing test additions for `<Topbar>` in `frontend/src/components/topbar.test.tsx`: segmented control rendered between actions and theme toggle; clicking "Chart focus" calls `onLayoutChange("focus")`; segmented control reflects `layout` prop.
- [X] **T053** [US2] Update `frontend/src/components/topbar.tsx` to render `<SegmentedControl>` with `{ value: "overview", label: "Overview" }`, `{ value: "focus", label: "Chart focus" }`. Add `layout` + `onLayoutChange` props (already in `contracts/components.md`).
- [X] **T054** [US2] Add a `HelpTooltip` to the segmented control wrapper explaining what Overview / Chart focus modes mean (Principle VI: new concept = paired tooltip). Tooltip content lives in `frontend/src/components/help-content.ts`.
- [X] **T055** [US2] Update `frontend/src/routes/run-viewer.tsx` to consume `useLayoutMode()` and pass `layout` / `onLayoutChange` to `<Topbar>`. Apply `className={layout === 'focus' ? 'content focus' : 'content'}` on the main content wrapper. Inside the wrapper, the design's CSS handles the `order:` reorder for `.stat-row`, `.chart-card`, `.trades-card`.
- [X] **T056** [US2] Failing test for layout-mode persistence + restore: in `frontend/src/routes/run-viewer.test.tsx`, set `localStorage["isb-layout"] = "focus"` before mount and assert the content wrapper has `.focus` class on first render.

**Checkpoint**: At this point, Users Stories 1 AND 2 work independently. Layout switches reorder content; preference persists.

---

## Phase 5: User Story 3 — New chart and feedback affordances (Priority: P3)

**Goal**: Add the `<Toast>` portal subscribed to the `fireToast` controller;
wire run triggers (`RunActions`, `PresetPicker`, `RiskKnobs`) to fire toasts.
Add the chart-side "Show rejections" toggle and the
`<RejectionClusterOverlay>` (cluster-collapsed tags per the clarified
algorithm), mirrored with the existing Rejections-card button.

**Independent Test**: With US1+US2+US3 shipped, every run-trigger button shows
a transient toast bottom-center. Toggling "Show rejections" from either the
chart header or the Rejections card causes grey `Rej` / `Rej · ×N` tags to
appear above rejected bars; hovering a cluster tag reveals all member
timestamps. The two controls stay in sync.

### Toast wiring

- [X] **T057** [P] [US3] Failing tests for `<Toast>` in `frontend/src/components/toast.test.tsx`: covers T-TOAST-1 through T-TOAST-4 from `contracts/states.md` against the actual React component (the controller is already unit-tested in T011).
- [X] **T058** [US3] Implement `frontend/src/components/toast.tsx` as a singleton portal subscribed to `toast-controller` via `useSyncExternalStore`. Renders bottom-center with spinning accent ring + message when `message !== null`. Mount the singleton `<Toast />` once in `frontend/src/App.tsx`, outside `<Routes>`, so it survives route navigation. (Fixes analyze finding I1 — wording resolved.)
- [X] **T059** [US3] Wire `fireToast` into run-trigger sites:
  - `frontend/src/components/run-actions.tsx`: call `fireToast("New backtest queued…")` on click.
  - `frontend/src/components/preset-picker.tsx`: call `fireToast('Running preset "<name>"…')` on preset click.
  - `frontend/src/components/risk-knobs.tsx`: call `fireToast("Running with custom settings…")` on "Run with these settings".
  - Update existing tests in each file to assert `fireToast` is called (use a spy on the imported controller).

### Show rejections — chart layer

- [X] **T060** [P] [US3] Failing tests for `registerRejectionClusterOverlay()` in `frontend/src/components/rejection-cluster-overlay.test.ts`: covers overlay registration and the produced overlay's id count given a sample cluster set (T-CLUSTER-7 from `contracts/states.md`).
- [X] **T061** [US3] Implement `frontend/src/components/rejection-cluster-overlay.ts`: `registerRejectionClusterOverlay()` (KLineCharts `registerOverlay` with `name: "rejectionClusterTag"`) and `createRejectionClusterOverlays(chart, clusters)` returning overlay ids. Visual: small grey tag (`--surface-3` bg, `--text-muted` text) anchored above the cluster's first bar; renders `Rej` for count=1, `Rej · ×N` for count>1; hover renders a small tooltip with the full timestamp list.
- [X] **T062** [US3] Failing test additions for `<PriceChart>` in `frontend/src/components/price-chart.test.tsx`: new optional `showRejections` prop; when `true`, overlay count matches cluster count returned by `clusterRejections(journal.filter(r => r.status === 'rejected'), bars)`; when `false`, zero rejection overlays exist; "Show rejections" header button toggles the same state when wired via `onToggle`.
- [X] **T063** [US3] Update `frontend/src/components/price-chart.tsx` to accept `showRejections?: boolean` prop and render a chart-header toggle button (mirrors the Rejections-card button). Use `clusterRejections` + the new overlay registration. Clean up overlays on toggle off and on unmount.

### Show rejections — sync between two surfaces

- [X] **T064** [US3] Update `frontend/src/routes/run-viewer.tsx` to pass the existing `showRejections` state down to both `<PriceChart>` (via new `showRejections` + `onToggle` props) and `<RejectionBreakdownCard>` (via existing `show` + `onToggle` props from T035). Add a Principle VI tooltip on the "Show rejections" toggle explaining the cluster behavior (What/Why/How).
- [X] **T065** [US3] Failing test in `frontend/src/routes/run-viewer.test.tsx`: toggling either button mutates the same state; both controls reflect the same active/inactive styling.

**Checkpoint**: All three user stories now functional and independently testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the success criteria, audit accessibility and performance,
and walk the quickstart manually.

- [X] **T066** [P] Token contract verification: ensure `tokens.test.ts` (T002) covers every token in `contracts/tokens.md`; expand if gaps exist. Run `npm test -- tokens.test.ts` to confirm SC-002.
- [ ] **T067** [P] Manual a11y audit per `quickstart.md`: run axe DevTools against dark and light pages; resolve any contrast or labeling violations to meet WCAG AA (SC-005).
- [ ] **T068** [P] Theme-flip performance verification: record a flip with Chrome Performance tab; confirm the `data-theme` attribute change to next paint is under 200ms (SC-003).
- [ ] **T069** [P] Layout-flip performance verification: record a "Chart focus" toggle; confirm completion under 300ms with no scroll-position loss (SC-008).
- [ ] **T070** [P] Toast latency verification: instrument `fireToast` with `console.time`; confirm `<200ms` to first paint and `<2.5s` to dismiss across 10 triggers (SC-009).
- [ ] **T071** [P] Skeleton verification: throttle network to Slow 3G; confirm skeletons render within 100ms of route resolution and no CLS during data arrival (SC-011).
- [ ] **T072** [P] CSV-missing graceful degradation: move a known run's source CSV aside; reload `/runs/<id>`; confirm chart shows `<ErrorCard>` with `source_data_missing`; sibling sections remain interactive (SC-012).
- [X] **T073** [P] HelpTooltip preservation audit: run `git grep -l "HelpTooltip" frontend/src/`; manually exercise each one to confirm content unchanged from pre-redesign (SC-004).
- [X] **T074** [P] Route preservation smoke test: bookmark three known run URLs before merge; verify they resolve to the same run data after merge (SC-007).
- [ ] **T075** Final pass through `quickstart.md`'s Story 1 / Story 2 / Story 3 verification tables; check every box.
- [X] **T076** Run the full vitest suite end-to-end: `cd frontend && npm test`. All tests must pass; coverage of new code via `npm run test -- --coverage` should be ≥ existing baseline (SC-006). (T077 deleted per analyze finding I2 — conditional doc task removed.)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup, T001–T005)**: No dependencies. Token rewrite leaves the app visually broken until Phase 3 lands; this is expected.
- **Phase 2 (Foundational, T006–T014)**: Depends on Phase 1 completion. **BLOCKS all user stories.** The test audit (T006) is the critical task — every subsequent restyle assumes the existing test suite uses semantic queries.
- **Phase 3 (US1, T015–T049)**: Depends on Phase 2 completion. The largest phase by volume; produces the MVP.
- **Phase 4 (US2, T050–T056)**: Depends on Phase 3 (specifically T018 / T019 — topbar exists).
- **Phase 5 (US3, T057–T065)**: Depends on Phase 3 (chart palette / Rejections card / RunActions / PresetPicker / RiskKnobs restyled). Does NOT depend on US2.
- **Phase 6 (Polish, T066–T077)**: Depends on all desired user stories. Run after the last story merges; the verification tasks are gates for the SCs.

### Within-Story Dependencies (test-first reminders)

- Every "failing tests" task MUST be authored and run (and confirmed FAILING) BEFORE its sibling implementation task.
- Most restyles (T015–T049) don't need new failing tests — the test audit (T006) already adapted the existing tests to semantic queries; the restyle is invisible to those queries. **New behaviors** introduced by US1 (win-rate meter, mini-legend, accent rails, skeletons, error cards) DO need new failing tests.

### Parallel Opportunities

- **Phase 1**: T004 + T005 can run in parallel after T003.
- **Phase 2**: T007/T008, T009/T010, T011/T012, T013/T014 — the four lib pairs are mutually independent. Their failing-test halves (T007, T009, T011, T013) can be authored in parallel after T006.
- **Phase 3**: Heavy parallelism. All restyle pairs target different files. Indicative parallel chunks:
  - Primitives: T020+T021, T022+T023, T024 — parallel.
  - Cards: T030+T031, T032+T033, T034+T035 — parallel.
  - Misc: T038+T039, T042+T043, T044, T045, T046, T047 — parallel.
  - Chart pair T036+T037 — sequential pair, but parallel to the cards.
  - Sidebar (T026+T027), Run header (T028+T029), Trades table (T040+T041) — parallel.
  - Shell/topbar (T015–T019) — sequential within the group, parallel to the rest after T019.
  - Loading/error refactor (T048+T049) — sequential, can run after the section components exist.
- **Phase 4**: T050+T051 in parallel with T052+T053; T054 and T055 sequential after T053; T056 last.
- **Phase 5**: T057+T058 in parallel with T060+T061; T059 after T058; T062+T063 sequential pair after T061; T064+T065 after T063+T035.
- **Phase 6**: All polish tasks are independent and parallel.

---

## Parallel Example — User Story 1 (US1) primitives

```bash
# Authoring failing tests in parallel:
Task: "Skeleton tests in frontend/src/components/skeleton.test.tsx"
Task: "ErrorCard tests in frontend/src/components/error-card.test.tsx"

# Implementing primitives in parallel (after tests fail):
Task: "Implement Skeleton in frontend/src/components/skeleton.tsx"
Task: "Implement ErrorCard in frontend/src/components/error-card.tsx"
Task: "Restyle Button variants in frontend/src/components/ui/button.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T005)
2. Complete Phase 2: Foundational (T006–T014) — CRITICAL, blocks all stories
3. Complete Phase 3: User Story 1 (T015–T049)
4. **STOP and VALIDATE**: run the quickstart's Story 1 verification table; manually verify the visual reskin in dark + light at three viewport widths
5. Deploy / demo

### Incremental Delivery

1. Phase 1 + Phase 2 → Foundation ready (visually broken; backend functionality intact)
2. Phase 3 → MVP shipped (full visual reskin, no segmented control, no toasts, no rejection overlay)
3. Phase 4 → Layout variants live
4. Phase 5 → Toast feedback + rejection overlay live
5. Phase 6 → Verify success criteria; ship

### Parallel Team Strategy (if multiple developers)

With 2–3 developers after Phase 2:

- Developer A: Shell + topbar + sidebar (T015–T019, T026–T027)
- Developer B: Three overview cards + win-rate meter (T030–T035, T038–T039)
- Developer C: Trades table + chart palette (T036–T037, T040–T041)

Then converge on US2 (one developer) and US3 (one developer in parallel).

---

## Notes

- `[P]` = different files, no incomplete dependencies — safe to parallelize.
- `[US1]` / `[US2]` / `[US3]` = traceable to spec.md's user stories.
- TDD discipline (Principle IV): every failing-test task lists a target file and an assertion intent. Implementation tasks that immediately follow MUST make the named test pass.
- Per the Constitution Check in `plan.md`, no NON-NEGOTIABLE principle is violated — no Complexity Tracking entries are needed.
- After Phase 3, the visual reskin is complete and the app is shippable as MVP. US2 and US3 are independently shippable on top.
- Backend untouched. All `backend/**` files are off-limits for this feature.
