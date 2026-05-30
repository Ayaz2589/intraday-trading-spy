# Component API Contracts

**Plan**: [../plan.md](../plan.md)

Each component below has a contract that downstream callers depend on. Tests
target these contracts; restyles MUST NOT break them.

---

## New components

### `<AppShell>`

```tsx
interface AppShellProps {
  sidebar: React.ReactNode;
  topbar: React.ReactNode;
  children: React.ReactNode;       // main column content
}

function AppShell(props: AppShellProps): JSX.Element;
```

- Renders the CSS grid `252px 1fr` shell.
- `sidebar` and `topbar` are render-prop-style slots.
- `children` mounts inside `<main className="main">` → `<div className="main-scroll">`.
- Responsive: at `≤860px` hides the sidebar via CSS (`.app { grid-template-columns: 1fr }`).

**Test contract**: renders three slots in the correct DOM positions; the
`children` slot is the only `overflow-y: auto` container.

### `<Topbar>`

```tsx
interface TopbarProps {
  // Action handlers
  onNewBacktest?: () => void;
  onDeleteRun?: () => void;
  onDeleteAll?: () => void;
  onOpenPresets?: () => void;
  onOpenCustomize?: () => void;
  // State indicators
  presetsOpen: boolean;
  customizeOpen: boolean;
  // Layout
  layout: LayoutMode;
  onLayoutChange: (next: LayoutMode) => void;
  // Theme — uses the shared useTheme hook internally OR receives via props
  theme: Theme;
  onThemeChange: (next: Theme) => void;
}
```

- Brand mark (`◑` glyph) + wordmark + `SPY · 5m` pill on the left.
- Action buttons + segmented + theme toggle on the right.
- `<HelpTooltip>` paired with new concept buttons (segmented control,
  customize).

**Test contract**: clicking each action button fires its handler; the
segmented control reflects `layout`; the theme toggle reflects `theme`.

### `<SegmentedControl>`

```tsx
interface SegmentedControlOption<V extends string = string> {
  value: V;
  label: string;
}

interface SegmentedControlProps<V extends string = string> {
  options: SegmentedControlOption<V>[];   // 2-5 options
  value: V;
  onChange: (next: V) => void;
  ariaLabel: string;                      // for the radiogroup container
}
```

- ARIA: container is `role="radiogroup"` with `aria-label`; each option is
  `role="radio"` with `aria-checked`.
- Keyboard: left/right arrows move selection; selection on focus.

**Test contract**: rendering with 2 options + value="A" → first button has
`aria-checked="true"`; pressing right arrow then space fires `onChange("B")`.

### `<Toast>`

```tsx
function Toast(): JSX.Element | null;     // singleton, no props

// Controller (lib/toast-controller.ts)
export function fireToast(message: string): void;
```

- Subscribes to the toast-controller module-level state.
- Renders as fixed bottom-center portal when `message !== null`.
- Auto-dismisses ~2.2s after each `fireToast` call.
- Re-fire replaces message + resets timer.

**Test contract**: calling `fireToast("hi")` makes the component render
with `getByText("hi")`; after ~2.2s `queryByText("hi")` returns null;
calling `fireToast("hi")` then `fireToast("hello")` 1s later shows
`"hello"` and not `"hi"`.

### `<Skeleton>`

```tsx
interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  rounded?: "sm" | "md" | "lg" | "pill" | "none";
  className?: string;
}
```

- Renders a div with a CSS pulse animation between `--surface-2` and `--surface-3`.
- `aria-hidden="true"` and `role="presentation"` so screen readers skip it.

**Test contract**: renders a presentation-role element with the given
`width`/`height`/`rounded` applied.

### `<ErrorCard>`

```tsx
interface ErrorCardProps {
  title?: string;           // default: "Something went wrong"
  message: string;          // the failure reason
  variant?: "section" | "page";   // default: "section"
}
```

- Renders a card with a `--loss`-colored left accent rail, `--loss-soft`
  background tint, title, and message.
- `role="alert"` for screen readers.

**Test contract**: renders the `message` prop verbatim; has `role="alert"`.

---

## Modified components (existing API preserved)

### `<HelpTooltip>` — trigger restyle only

**Existing API** (UNCHANGED):

```tsx
interface HelpTooltipProps {
  conceptKey: string;       // looks up content from help-content.ts
  // or
  what?: string;
  why?: string;
  how?: string;
}
```

**Visual change**: trigger styled as `.info-dot` (13×13 px circle, `1px solid
var(--border-strong)`, `var(--text-faint)` foreground, font-weight 700,
font-size 8.5px). On hover, ring tints to `var(--accent)`. The popover
content (What / Why / How) is unchanged.

**Test contract**: existing tests in `help-tooltip.test.tsx` continue to
pass without assertion changes; the trigger element is keyboard-focusable
(Tab); pressing Enter or Space opens the tooltip.

### `<RunsSidebar>` — restyle + footer legend addition

**Existing API** (UNCHANGED):

```tsx
interface RunsSidebarProps {
  runs: RunSummaryView[];
  selectedRunId: string | null;
}
```

**Visual change**: matches the handoff's `.sidebar` block. Each run-item is
a rounded card showing: run id (mono, 11.5px, 600), timestamp (faint,
11.5px), P&L badge (`+0.00R` color-coded), trade count (`3t`, mono).
**Footer added**: mini legend with VWAP dot (amber) and OR-hi/lo dot
(green) per FR-015.

**Test contract**: each run row renders id + timestamp + P&L badge + trade
count; clicking a row navigates via React Router; the active row gets
`aria-current="page"`.

### `<RunHeader>` — restyle

**Existing API** (UNCHANGED):

```tsx
interface RunHeaderProps {
  manifest: RunManifestView;
}
```

**Visual change**: matches the handoff's `.run-header` block. Title is
`<h1 class="rh-title mono">` showing the run id; a "complete" profit-badge
sits inline; meta row below with `Started`, `Code`, `Data` labels styled
as overlines, values in mono, separated by tiny dot dividers.

**Test contract**: renders the run id from manifest as an `<h1>`; meta row
contains the started-at, code version (truncated), and data fingerprint.

### `<StrategyConfigCard>`, `<SummaryMetricsCard>`, `<RejectionBreakdownCard>` — restyle + accent rails

**Existing APIs** (UNCHANGED): each takes its data prop (manifest, summary,
or breakdown+total) and renders accordingly.

**Visual changes**:
- All three cards get the handoff's `.card` styling (rounded `--r-lg`,
  `--surface` bg, `--border` border, `--shadow-sm`).
- Each gets a 4px colored accent bar before the card title:
  - Config card → `--accent`
  - Summary card → `--info`
  - Rejections card → `--warn`
- **Config**: 3-column grid of label/value pairs; "Setup" spans 2 columns;
  values in mono.
- **Summary**: 4-column grid of stats with overline labels and big mono
  values; **win-rate meter** added (FR-017) — a 7px-tall horizontal bar
  whose `width:%` fill uses a `--accent` → `--info` gradient.
- **Rejections**: list of rows (reason / amber bar / count); "Show on chart"
  button toggles the chart's rejection overlay (FR-008, wired via prop).

**Test contract for Summary**: the win-rate meter is queryable by role
(`progressbar`) with `aria-valuenow={winRate}`. The existing data assertions
(numeric values, signs) pass unchanged.

### `<PriceChart>` — palette restyle + rejection layer

**Existing API** — UNCHANGED:

```tsx
interface PriceChartProps {
  bars: BarView[];
  vwap: { time: string; value: number }[];
  or: { high: number; low: number; from: string; to: string } | null;
  markers: ChartMarker[];
  journal: JournalRowView[];
  accountValue: number;
  positionCapPct: number;
}
```

**New optional prop**:

```tsx
showRejections?: boolean;   // default: false
```

**Visual changes**:
- All candle / wick colors swap to the design's `--profit` / `--loss`.
- VWAP polyline color → `--warn` (already amber, value tweaks to `#f5a524`).
- OR-Hi line → `--profit`, OR-Lo → `--loss`.
- Entry dot border → `--accent`; exit dot border → `--profit` (target),
  `--loss` (stop), `--text-faint` (force-flat).
- "Last close" dashed line → price-direction-aware `--profit` / `--loss`.
- `tradeRationaleTag` and `pill` overlays consume the new token values.
- Chart-card header gets a new "Show rejections" toggle button (mirrors
  the existing Rejections-card button).

**Test contract**: existing chart tests pass; new prop `showRejections`
when `true` renders `<RejectionClusterOverlay>` content (asserted via
the registered overlay's id count).

### `<JournalTable>` — restyle + 3-column expanded detail

**Existing API** (UNCHANGED):

```tsx
interface JournalTableProps {
  rows: JournalRowView[];
  filter: JournalFilter;
  onFilterChange: (next: JournalFilter) => void;
}
```

**Visual changes**:
- Filter tabs become pill buttons (`--r-pill`) with count badges.
- Active tab uses solid `--accent` background with white text.
- Table header overlines use `--text-faint`.
- **Expanded detail panel** restyled to the handoff's 3-column grid:
  - Column 1: Indicator snapshot (VWAP, OR high/low, Distance %, Prior bar close)
  - Column 2: Planned trade (Direction chip, Planned entry, Stop, Take profit,
    Quantity, Planned risk $)
  - Column 3: Outcome (Actual entry, Actual exit, Exit reason, Realized R,
    Realized $, Same-bar tiebreak)
  - Full-width footer: "Full reason" (italic text)
  - Left accent rail (`--accent`) on the detail panel
  - Detail rows separated by dashed `--border` dividers.

**Test contract**: each row remains clickable to expand; the expanded
panel contains the three section headings (Indicator snapshot / Planned
trade / Outcome); existing data assertions pass.

### `<SessionPicker>` — 2-line day tabs

**Existing API** (UNCHANGED):

```tsx
interface SessionPickerProps {
  sessions: string[];                // ISO YYYY-MM-DD
  selected: string | null;
  onChange: (next: string) => void;
}
```

**Visual change**: each tab becomes a small card with two lines:
- Line 1: weekday abbreviation (`Mon`, 9.5px, 700, uppercase, `--text-faint`)
- Line 2: short date (`05-26`, 13px, 600, mono, `--text-muted`)
- Active tab: `--accent-soft` background, `--border-accent` border,
  `--accent` text for both lines.

**Test contract**: each session renders as a card with the correct
weekday label and date; clicking fires `onChange` with the session ISO.

### `<ThemeToggle>` — pill track + thumb

**Existing API** (UNCHANGED):

```tsx
function ThemeToggle(): JSX.Element;
```

**Visual change**: matches the handoff's `.tt-track` (48×26 pill) + `.tt-thumb`
(20px circle) styling. Dark mode → thumb on left, moon glyph (`☾`), accent
blue. Light mode → thumb on right (`translateX(22px)`), sun glyph (`☀`),
amber bg.

**Test contract**: button has `aria-label="Toggle theme"`; clicking toggles
the theme via `useTheme`.

### `<PresetPicker>`, `<RiskKnobs>` — popover restyle

**Existing APIs** (UNCHANGED). Visual changes per the handoff's
`.preset-pop` / `.knobs-pop`:
- Floating card, `--r-lg`, `--shadow-pop`, pop-in animation.
- Header with title + sub-title or close button.
- Body content restyled per the handoff (preset list rows; knob rows
  with label + field + suffix).

**Test contract**: opening / closing the popover and submitting values
continues to work; existing behavior tests pass.

### `<StatusBadge>` — design badge styling

**Existing API** (UNCHANGED):

```tsx
interface StatusBadgeProps {
  status: JournalRowView["status"];
}
```

**Visual change**: matches the handoff's `.badge` + `.badge-dot` styling.
Color mapping per handoff: Emitted=info, Executed=profit, Exited=warn,
Rejected=loss, Lockout=faint, ForceFlat=accent.

**Test contract**: renders with the correct color class per status;
existing tests pass.

### `<RunActions>` — primary/ghost/danger-ghost styling

**Existing API** (UNCHANGED). Visual change: buttons get the new
`.btn-primary` / `.btn-ghost` / `.btn-danger-ghost` styling per the handoff.

---

## Convention summary

Every component contract above follows these rules to honor SC-006
("existing frontend tests pass without modification of their assertions"):

1. **Existing prop shapes are immutable.** Only additions (e.g., optional
   `showRejections` on `PriceChart`) are allowed.
2. **Existing event behavior is immutable.** A button that fired an
   `onClick` still fires it.
3. **Existing accessibility behavior is preserved or strengthened.** Roles,
   labels, and keyboard handling are at minimum equivalent; new components
   meet WAI-ARIA recommendations.
4. **DOM structure changes only when the visual design requires it.** The
   expanded trade detail (1-column → 3-column) is the largest structural
   change; tests targeting the section-header text continue to pass; tests
   targeting specific column indices need updates.

A pre-restyle test-audit task (per R10) converts class-name-targeting tests
to semantic queries before any restyle lands.
