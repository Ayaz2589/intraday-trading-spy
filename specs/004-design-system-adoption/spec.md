# Feature Specification: Design System Adoption — Intraday Strategy Builder

**Feature Branch**: `004-design-system-adoption`

**Created**: 2026-05-30

**Status**: Draft

**Input**: User description: "Adopt the new design system for the Intraday Strategy Builder dashboard. Replace the existing shadcn HSL token system with the design's hex-based tokens (Plus Jakarta Sans + JetBrains Mono fonts, dark theme primary with light parity, #2563eb as the only brand/action color, P&L-only green/red semantics). Rebuild the app shell as a CSS-grid layout (252px sidebar | 1fr main) with a sticky blurred topbar, scrollable main column, and a segmented layout control (Overview ↔ Chart focus) that reorders the chart vs. stat row. Restyle all existing components — runs sidebar, run header, Config / Summary / Rejections cards (with 4px accent bars and a gradient win-rate meter), KLineCharts price chart (preserve all current overlays: VWAP indicator, OR lines, S/R levels, entry/exit dots, rationale popovers, click-to-inspect; restyle candle/wick/marker palette to design tokens), and the trades table with filter tabs + the 3-column expanded detail panel (Indicator snapshot · Planned trade · Outcome + full-width reason). Wire the design's `.info-dot` style to the existing `HelpTooltip` system so the constitutional educational layer is preserved. Add a toast component for run-start feedback. New chart affordance: a 'Show rejections' toggle that puts grey 'Rej' tags above bars where signals were rejected (mirroring the existing Rejections card button). Preserve React Router routing (/runs/:run_id) and all API data wiring."

## Clarifications

### Session 2026-05-30

- Q: Should the "Chart focus" layout preference persist across page reloads? → A: Persist in `localStorage`, same pattern as theme.
- Q: How should the chart's "Show rejections" overlay handle consecutive clusters of same-reason rejections? → A: One tag per cluster with a count badge (`Rej · ×N`); hover reveals all timestamps in the cluster.
- Q: Where should the design's fonts (Plus Jakarta Sans + JetBrains Mono) load from in v1? → A: Google Fonts CDN via `@import`, matching the handoff prototype. Self-hosting is deferred.
- Q: How should loading and error states for the four async data sections (runs, manifest, summary, journal, bars) render? → A: Skeleton placeholders matched to target card shape while loading; styled error cards with a `--loss` accent rail + reason text on fetch failure.
- Q: What should the topbar's brand mark be in v1? → A: Keep the handoff's `◑` Unicode glyph verbatim as a placeholder; bespoke logo deferred.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Cohesive visual reskin (Priority: P1)

A trader who already uses the Intraday Strategy Builder opens the dashboard after the
redesign ships. Every surface they encounter — topbar, sidebar, run header, the three
overview cards, the price chart, the trades table, the Preset / Customize popovers —
shares one visual language: dark-primary fintech aesthetic, a single confident blue for
primary actions, green / red reserved exclusively for P&L, mono numerics that align in
columns, soft rounded cards with subtle shadows. They can flip between dark and light
themes from the topbar and the entire UI re-tints instantly without flicker. Every
educational `?` info-dot still opens its existing tooltip explaining what the concept
means, why it matters, and how the app is using it.

**Why this priority**: This is the *visible* deliverable of the redesign — without it
the feature has shipped nothing. It is the largest slice, but it is internally cohesive:
ship anything less and the app looks half-finished (e.g. restyled cards over the old
shell, or new tokens but unchanged components).

**Independent Test**: With this story alone shipped, the user can open the dashboard,
verify every surface matches the design handoff's reference screens (dark + light), use
every existing feature (select a run, switch sessions, expand a trade row, open a
preset, customize knobs, toggle theme, view chart overlays, click an entry / exit dot
for rationale), and confirm no existing capability has regressed.

**Acceptance Scenarios**:

1. **Given** the dashboard loads in dark mode, **When** the user scans the page, **Then**
   the background, surfaces, text colors, accent blue, and P&L green / red exactly match
   the values declared in the handoff's `tokens.css` for `[data-theme="dark"]`.
2. **Given** the user clicks the theme toggle, **When** the theme flips to light, **Then**
   the swap completes within one frame with no element frozen mid-transition and the
   chosen theme persists across page reloads.
3. **Given** the user hovers any `?` info-dot, **When** the tooltip opens, **Then** the
   tooltip surface uses the design's tokens and the educational copy (What / Why / How)
   matches the existing pre-redesign content for that concept.
4. **Given** the user expands a trade row, **When** the detail panel renders, **Then** it
   shows three columns labeled Indicator snapshot, Planned trade, Outcome, with a left
   accent rail, and a full-width "Full reason" row underneath.
5. **Given** the user clicks an entry or exit dot on the VWAP line, **When** the
   rationale popover opens, **Then** the popover surface uses the design's tokens and the
   pre-redesign rationale content (trigger checks, planned trade, outcome) is preserved.
6. **Given** the user navigates directly to `/runs/<run_id>`, **When** the route resolves,
   **Then** the deep-linked run loads with the correct data and the restyled shell.
7. **Given** the user resizes the window to ≤1180px wide, **When** the stat row reflows,
   **Then** Config and Summary cards collapse to a single row of two and the Rejections
   card spans both columns underneath.
8. **Given** the user resizes the window to ≤860px wide, **When** the layout reflows,
   **Then** the sidebar is hidden and every section stacks into one column.

---

### User Story 2 — Layout variants for chart-first workflows (Priority: P2)

A trader who spends most of their session reading the chart wants the chart to occupy
the top of the screen. They click "Chart focus" in the topbar's segmented control and
the chart card reorders above the stat row, with the three overview cards (Config /
Summary / Rejections) becoming three equal columns below. Clicking "Overview" returns
to the default stats-first layout.

**Why this priority**: A real productivity affordance for power users, but the app is
fully usable without it (the default "Overview" layout serves every workflow). Ship P1
first; this is a discrete addition.

**Independent Test**: With only P1 and P2 shipped, the user can verify the segmented
control appears in the topbar, clicking each option reorders the main column visibly,
the active option is visually indicated, and the rest of the dashboard behaves
identically.

**Acceptance Scenarios**:

1. **Given** the user is in "Overview" mode, **When** they click "Chart focus", **Then**
   the chart card moves above the stat row and the stat row becomes three equal columns.
2. **Given** the user is in "Chart focus" mode, **When** they click "Overview", **Then**
   the original stat-row-then-chart order returns and the stat row reverts to the
   Config-Summary-Rejections column proportions.
3. **Given** the segmented control shows the active mode, **When** the user inspects it,
   **Then** the active option has the design's "segmented-on" styling (raised surface,
   stronger text color) and the inactive option uses the muted styling.

---

### User Story 3 — New chart and feedback affordances (Priority: P3)

A trader queues a new backtest from the topbar and sees a transient confirmation toast
at the bottom of the screen ("New backtest queued…"), so they know the request was
registered before the new run appears in the sidebar. While reviewing a chart, they
toggle "Show rejections" and small grey "Rej" tags appear above bars where signals
were rejected, letting them visually answer "why didn't this trade fire?" without
opening the trades table. Toggling the Rejections card's "Show on chart" button stays
in sync with the chart-level toggle.

**Why this priority**: Both items add comfort and clarity but the app is functional
without them — the user can already verify the new run via the sidebar and read
rejection counts from the Rejections card. Discrete, additive, deferrable.

**Independent Test**: With P1+P2+P3 shipped, the user can click any run-trigger
(New backtest, Run preset, Run with these settings) and observe a toast appearing for
the configured duration, then auto-dismissing. They can toggle the "Show rejections"
control from either the chart header or the Rejections card and see grey "Rej" tags
appear / disappear above rejected bars, with both controls reflecting the same state.

**Acceptance Scenarios**:

1. **Given** the user clicks "New backtest" (or any preset / customize run trigger),
   **When** the request is queued, **Then** a toast appears at bottom-center with a
   spinning accent ring and a message naming the action, and auto-dismisses after
   roughly 2 seconds.
2. **Given** the toast is visible, **When** a new run completes and appears in the
   sidebar, **Then** the toast does not block sidebar interaction.
3. **Given** the user clicks "Show rejections" in the chart header, **When** the chart
   re-renders, **Then** every rejected-signal bar is represented by a grey tag above
   the chart — single bars show `Rej`, consecutive same-reason bars collapse into one
   tag at the cluster's first bar showing `Rej · ×N` — and the Rejections card button
   reflects the active state. Hovering a cluster tag reveals all timestamps in it.
4. **Given** the user clicks "Show on chart" in the Rejections card, **When** the chart
   re-renders, **Then** the chart-header "Show rejections" button reflects the same
   active state (mirrored).

---

### Edge Cases

- **Theme flicker**: token-driven `color` / `background-color` properties must not
  freeze mid-transition during the theme swap. The handoff specifies a
  `.theme-no-anim` class applied for one frame as the mechanism; the implementation
  must achieve the same flicker-free behavior.
- **Long run identifiers**: Sidebar `run-id` entries (`20260530-151016-7697908e`) and
  truncated `code` hashes must not overflow card boundaries; truncate with ellipsis or
  wrap to two lines per the design.
- **High run counts**: The runs sidebar must scroll independently of the main column
  when more than ~20 runs are present without breaking the sticky topbar.
- **Filter tab counts**: Filter pills must remain readable when counts reach 3 digits
  (e.g. "Rejected 117").
- **Numeric precision**: Mono numeric columns (Realized R, Realized $, etc.) must align
  via tabular numerals even when values include `+` / `−` signs and 1–4 digit decimals.
- **Single-day or zero-day runs**: Day tabs must render gracefully when only one
  trading session exists in the run; collapse or render as a single non-clickable label.
- **Rapid run triggering**: If the user triggers two runs in quick succession, the toast
  must either queue or replace cleanly — no two toasts overlapping at the same position.
- **Rejection overlay density**: Consecutive same-reason rejections collapse to a
  single `Rej · ×N` cluster tag at the cluster's first bar. A "cluster" is a maximal
  run of contiguous bars sharing one rejection check; a different check starts a new
  cluster. Hover surfaces every member timestamp. Non-contiguous rejections (gaps of
  one or more non-rejected bars between them) form separate tags. This keeps the chart
  legible regardless of rejection volume.
- **Chart popover edge cases**: Entry / exit rationale popovers anchored to dots near
  the right edge of the chart must reposition so they remain fully visible.
- **HelpTooltip keyboard access**: The redesigned `?` info-dot must remain
  keyboard-focusable and trigger the existing tooltip content via keyboard activation
  (Enter / Space).
- **Light-theme contrast**: All body text and badges must meet WCAG AA contrast in
  the light theme, where some `--text-faint` values are subtler than in dark.
- **Layout variant during deep-link**: If the user deep-links to a run, the previously
  persisted layout preference (from `localStorage`) is restored on load; if no
  preference is stored (first visit), the default is "Overview".
- **Browser without backdrop-filter**: The sticky topbar uses a blurred translucent
  background; on browsers lacking blur support, the topbar must fall back to an opaque
  background that preserves contrast with content scrolling beneath.
- **Slow fetch / partial load**: Each section loads independently. Sections that
  resolve first must render immediately; sections still loading must continue showing
  skeletons; sections that fail must render as styled error cards without affecting
  siblings.
- **Source CSV missing (`source_data_missing`)**: The chart section renders an error
  card explaining the bars CSV referenced by the run is no longer on disk; the rest
  of the page (run header, cards, table) remains usable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST present a single, internally consistent visual style
  across topbar, sidebar, run header, overview cards, chart card, trades table, and all
  popovers — no surfaces using legacy styles after release.
- **FR-002**: The dashboard MUST support a dark theme (primary) and a light theme with
  full feature parity; the chosen theme MUST persist across page reloads.
- **FR-003**: The dashboard MUST reserve one brand / action color (a confident blue)
  for primary calls-to-action and active states only; green and red MUST appear only on
  monetary or P&L semantics (profit / loss / W / L / Realized R / Realized $).
- **FR-004**: All numeric, monetary, and identifier (run-id, code-hash) values MUST use
  a monospaced typeface with tabular numerals so columns visually align.
- **FR-005**: Every UI concept that previously had a `?` `HelpTooltip` MUST continue to
  show that tooltip's What / Why / How content; only the trigger's visual styling MAY
  change.
- **FR-006**: Users MUST be able to switch between an "Overview" layout (stat row →
  chart → table) and a "Chart focus" layout (chart → stat row → table) via a topbar
  segmented control. The active layout MUST be visually indicated in the control. The
  chosen layout MUST persist across page reloads, identical in behavior to the theme
  preference.
- **FR-007**: Users MUST see a transient toast confirmation whenever a new backtest is
  triggered (from "New backtest", from any preset, or from "Customize → Run with these
  settings"). The toast MUST identify the action and auto-dismiss without user input.
- **FR-008**: Users MUST be able to toggle a chart overlay that visually marks bars
  where signals were rejected. The toggle MUST be available from two places — the
  chart card's header and the Rejections overview card — and the two controls MUST
  remain in sync. Consecutive rejections sharing the same rejection check MUST collapse
  into a single tag anchored at the cluster's first bar, displaying a count badge in
  the form `Rej · ×N`. Hovering the cluster tag MUST reveal every bar timestamp it
  represents. A single-bar rejection MUST render as a plain `Rej` tag with no count.
- **FR-009**: The runs sidebar MUST display, for each run: the run identifier, a
  timestamp, a P&L badge color-coded by sign (green ≥ 0, red < 0), and a trade count.
  The active run MUST be visually distinguished from inactive runs.
- **FR-010**: The price chart's candlestick palette, VWAP polyline, opening-range
  lines, support / resistance levels, last-close marker, entry / exit dots, and trade
  marker pills MUST use the design's token values (or the closest semantic mapping —
  `--profit` for bullish, `--loss` for bearish, `--warn` for VWAP, etc.).
- **FR-011**: The trades table expansion MUST present three labeled sections in a
  three-column grid — Indicator snapshot, Planned trade, Outcome — followed by a
  full-width "Full reason" block. The panel MUST have a left accent rail.
- **FR-012**: The dashboard MUST remain usable at widths ≤1180px (stat row collapses
  to two columns; Rejections card spans both) and ≤860px (sidebar hidden; single-column
  stack).
- **FR-013**: The existing route shape (`/`, `/runs/:run_id`) MUST remain valid and
  produce identical data behavior; deep-linking to a run MUST work as before.
- **FR-014**: All existing backtest run data, journal rows, summary metrics, OR levels,
  rejection breakdowns, and configured presets MUST render without changes to the
  backend API or stored data shape.
- **FR-015**: The runs sidebar MUST include a footer mini-legend identifying the
  chart's VWAP color (amber) and OR-high / low color (green) so users learn the
  chart's visual language at a glance.
- **FR-016**: The Config card MUST display its accent in the brand-action color
  (`--accent`); the Summary card in info-cyan (`--info`); the Rejections card in
  amber-warn (`--warn`) — providing learnable visual identity for each.
- **FR-017**: The Summary card MUST include a visible win-rate meter (a horizontal bar
  whose fill width tracks the run's win-rate percentage, with a brand-to-info gradient).
- **FR-018**: Existing chart interactions MUST be preserved — clicking a candle still
  opens the bar inspector, clicking an entry / exit dot still opens the trade rationale
  popover, hovering shows the OHLC tooltip.
- **FR-019**: The brand wordmark and "SPY · 5m" pill MUST appear in the topbar's left
  edge, immediately identifying the product, instrument, and timeframe.
- **FR-020**: The runs sidebar's run-count pill MUST update live as runs are added or
  cleared.
- **FR-021**: Each async data section (runs, manifest, summary, journal, bars) MUST
  render a skeleton placeholder while loading. The placeholder MUST occupy the same
  layout area and approximate shape as the loaded content, so data arrival does not
  reflow surrounding sections. Skeletons MUST use a subtle pulse animation in the
  design's surface tokens.
- **FR-022**: When an async data section fails to load, the section MUST render a
  styled error card with a `--loss`-colored left accent rail and a reason text
  (including specific guidance for the known `source_data_missing` failure mode used
  by the chart). Errors MUST NOT replace the entire page; sibling sections that
  loaded successfully MUST continue to render.

### Key Entities

- **Run**: a single backtest execution with id (timestamp + hash), started-at, code
  version, data fingerprint, summary metrics, trades, and rejections. Surfaces in the
  sidebar and run header.
- **Trade row**: a single journal entry with timestamp, status (Emitted / Approved /
  Executed / Exited / Rejected / Lockout / Force Flat), planned vs actual entry / stop
  / target, quantity, planned risk $, realized R, realized $, reason text, and
  rejection check. Surfaces in the trades table and expanded detail.
- **Indicator snapshot**: VWAP, OR high / low, distance from VWAP %, prior bar close
  at the trade's timestamp. Surfaces in the expanded trade detail's first column and
  in the chart overlays.
- **Preset**: a named config file (`default`, `aggressive`, `demo`, `low-risk`,
  `vwap50`, etc.) with a description and file path. Surfaces in the Presets popover.
- **Knob set**: the editable risk + strategy parameters (account, risk / trade, position
  cap, max consecutive losses, opening-range minutes, risk : reward, stop buffer, max
  distance from VWAP, data window) used by the Customize popover.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time user given the redesigned dashboard can correctly identify
  the active run, its P&L outcome, and start a new backtest from the topbar within 30
  seconds of seeing the screen — verified by unmoderated observation on three users.
- **SC-002**: Token values for backgrounds, surfaces, text, accent, profit, loss, warn,
  and info match the handoff's reference values to within one named CSS-variable per
  theme (dark + light), confirmed by reading the live computed style on representative
  elements.
- **SC-003**: Theme toggle from dark to light completes in under 200ms with no element
  visibly frozen mid-transition, verified by frame inspection of a screen recording.
- **SC-004**: 100% of UI concepts previously wrapped in a `HelpTooltip` remain
  reachable and open the same content after the redesign — verified by enumerating
  tooltips in the source tree and exercising each one in the UI.
- **SC-005**: Color-contrast for body text, badges, and accent-on-surface pairings
  meets WCAG AA (4.5:1 for body text, 3:1 for ≥18pt) in both themes — verified by an
  automated contrast checker against the live tokens.
- **SC-006**: All existing frontend tests pass without modification of their assertions
  (only test data / DOM-query updates allowed where the redesign legitimately renames
  classes or restructures DOM).
- **SC-007**: Existing route URLs continue to resolve to the same run data — verified
  by smoke-loading three known run ids before and after the redesign.
- **SC-008**: Layout variant switch (Overview ↔ Chart focus) completes visibly within
  300ms with no content-jump or scroll-position loss — verified by recording the
  transition.
- **SC-009**: Run-trigger toast appears within 200ms of the trigger click and
  auto-dismisses within 2.5s; only one toast is visible at a time — verified by
  triggering two runs in rapid succession.
- **SC-010**: "Show rejections" toggle, when ON, represents every journal row of
  status Rejected from the active session in the chart's rejection layer — verified by
  taking the active session's rejection rows, computing the expected cluster set
  (contiguous bars sharing one rejection check), and confirming the rendered tag count
  matches the cluster count and each cluster tag's hover-reveal lists exactly the
  expected timestamps.
- **SC-011**: Cold-loading a deep-linked run shows skeleton placeholders for every
  section within 100ms of route resolution; data-bearing sections replace their
  skeletons within 2s on a typical local fetch. No layout shift occurs as sections
  resolve — verified by recording a cold-load and inspecting frame-by-frame.
- **SC-012**: A run with a missing source CSV renders an error card in the chart
  section explaining the failure, and the surrounding sections (run header, three
  overview cards, trades table) remain interactive — verified by deleting the
  underlying CSV of a known run and reloading.

## Assumptions

- The "Chart focus" layout preference persists across page reloads via `localStorage`
  (same pattern as the theme preference). Default on first visit (no stored value) is
  "Overview".
- The brand glyph (`◑`) from the prototype is acceptable as a placeholder for v1; a
  bespoke logo is a future polish item, not a v1 deliverable.
- The toast appears for every run-trigger action ("New backtest", any Preset, any
  Customize-driven run) using a consistent visual treatment; messages differ only in
  copy.
- Existing `HelpTooltip` content is correct and complete; this feature does not audit
  or rewrite tooltip copy.
- Existing chart overlay logic (VWAP indicator, OR lines, S / R levels, entry / exit
  rationale dots, click-to-inspect bar popover) is preserved in behavior; only visual
  styling is updated.
- Fonts (Plus Jakarta Sans, JetBrains Mono) are loaded from a public CDN in v1;
  self-hosting is a future hardening item not required for v1.
- Existing `HelpTooltip`, `Popover`, `Tabs`, `Tooltip` UI primitives may be retained
  internally; only their styling is replaced. The design's tokens drive their colors
  and shapes.
- All current users access the dashboard on desktop or large-tablet screens
  (≥860px width). Mobile reflows but is not a designed-for use case.
- The "Show rejections" overlay surfaces rejection rows already in the journal
  payload; no API change is required.
- Run-trigger toasts surface the user-initiated start of a backtest, not the
  long-running progress or completion (which appears via the sidebar list refresh).
- The existing `data/raw/` CSV inventory and the runs in `backend/data/backtests/` are
  the data corpus; this redesign does not alter what data exists, only how it renders.
