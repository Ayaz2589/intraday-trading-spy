# Phase 0 Research: Design System Adoption

**Date**: 2026-05-30  
**Plan**: [plan.md](./plan.md)  
**Spec**: [spec.md](./spec.md)

This document resolves every research thread implied by the plan's Technical
Context. Each section follows the Decision / Rationale / Alternatives format.

---

## R1 — Token system: how to host the design's tokens inside a Tailwind v4 codebase

### Decision

Replace `frontend/src/styles/index.css` with the design handoff's `tokens.css`
verbatim (theme via `[data-theme]` selector on `<html>`), then re-emit the
small set of base rules currently in `index.css` (body color, body background,
scrollbar styling) as plain CSS that consumes the new `--`-named tokens. Tailwind
v4 keeps its `@import "tailwindcss"` directive at the top of `index.css`; arbitrary
utility classes (`bg-[var(--surface)]`, `text-[var(--text-muted)]`,
`border-[color:var(--border)]`) consume the tokens directly. Where a token is
used in 3+ places, prefer a thin Tailwind-arbitrary-value utility or a small
component class.

### Rationale

- Tailwind v4's CSS-variable model is *exactly* what the design's `tokens.css`
  uses — same `[data-theme="dark"|"light"]` switching pattern, same `:root`
  fallback. Adopting the design's tokens verbatim means zero translation layer
  and zero divergence risk.
- The existing shadcn HSL system (`--background`, `--foreground` with HSL
  values) doesn't map cleanly: shadcn assumes `hsl(var(--background))` wrappers
  at use sites, while the design uses `var(--bg-app)` directly with hex/rgba
  values. A clean replacement is less work and less confusion than running
  both in parallel (which was option B in our pre-spec brainstorm, rejected).
- The handoff's tokens.css is the single source of truth. Drift between two
  systems is the most common failure mode of "design system" projects.

### Alternatives considered

- **Parallel layer (shadcn + design tokens both alive)**: rejected during
  brainstorm. Would create permanent "which token do I use?" confusion.
- **Translate design tokens into shadcn HSL form**: lossy (hex → HSL → re-quantized),
  doubles the token count to maintain, and forces every component to keep
  using the shadcn `hsl(var(...))` wrapper.
- **Stop using Tailwind, ship plain CSS**: huge refactor, no benefit. Tailwind
  v4's arbitrary-value support handles the design's tokens fine.

---

## R2 — Theme transition flicker: how to suppress `color` / `background-color` mid-flight

### Decision

Adopt the handoff's pattern: when the theme flips, add a class
`theme-no-anim` on `document.documentElement` that contains `* { transition:
none !important; }`. Set the `data-theme` attribute, schedule two
`requestAnimationFrame` callbacks, then remove the class. This guarantees the
new tokens apply on the next paint without any in-flight transitions on
color/background properties. The pattern lives in `src/lib/theme.ts` (currently
hosting `useTheme`); the same pattern is reused for `useLayoutMode` since
layout swap is much less color-sensitive but benefits from consistent timing.

### Rationale

- The design ships this pattern as part of `styles.css` (verbatim:
  `.theme-no-anim *, .theme-no-anim *::before, .theme-no-anim *::after {
  transition: none !important; }`). Re-using the exact mechanism makes it
  trivial to validate against the design's reference HTML.
- Browser perf: the two-frame `requestAnimationFrame` schedule is well under
  the SC-003 budget of 200ms (typical 16ms × 2 = 32ms).
- The `*` selector is acceptable here because the class is on the page for at
  most ~33ms.

### Alternatives considered

- **Transition only `transform`, `opacity`, `border-color`, `box-shadow`** (never
  `color` / `background-color`): would work but constrains all future component
  authors. Higher long-term cost.
- **No suppression — let transitions interpolate**: produces visible flicker
  on cards mid-flip; fails SC-003.
- **Use `view-transition-api`**: still partial browser support; overkill for
  a binary theme swap.

---

## R3 — Font loading: Google Fonts CDN strategy

### Decision

Keep the handoff's `@import url('https://fonts.googleapis.com/...')` at the top
of `tokens.css`. Use the `&display=swap` parameter to prevent flash-of-invisible-
text. Load both families (`Plus Jakarta Sans`: 400/500/600/700/800;
`JetBrains Mono`: 400/500/600/700) per the handoff's exact spec. **No
preconnect / preload optimizations in v1** — they fall under the
"self-hosting / hardening" follow-up.

### Rationale

- Decided in `/speckit-clarify` Q3.
- The `@import` lives inside `tokens.css`, which is the first CSS the browser
  parses. Google Fonts CSS in turn references `fonts.gstatic.com` for the
  woff2 binaries — by the time the first paint happens, the font files are
  either cached (warm load) or fetching in parallel with the rest of the page.
- `display=swap` makes the page render with system fallback first, then swap
  to Jakarta / JetBrains Mono. The handoff prototype already uses this and the
  visual result is acceptable.

### Alternatives considered

- **`@fontsource/...` npm packages, self-hosted**: better for privacy & CSP, but
  the handoff specifically defers this to a future iteration. Adds build
  complexity for marginal v1 benefit. Worth doing in a hardening pass.
- **System-font fallback only**: rejected — the design's visual quality
  depends on the chosen families, especially the tabular numerals in
  JetBrains Mono.

---

## R4 — KLineCharts theming: how to apply the design's palette without rewriting overlays

### Decision

Update the `THEMES` constant in `frontend/src/components/price-chart.tsx` to map
the existing dark/light theme objects to the design's tokens:

| KLineCharts key | New token mapping |
|---|---|
| `candle.bar.upColor`, `upBorderColor`, `upWickColor` | `--profit` |
| `candle.bar.downColor`, `downBorderColor`, `downWickColor` | `--loss` |
| `grid.{horizontal,vertical}.color` | `--grid` |
| `crosshair.{horizontal,vertical}.line.color` | `--text-faint` |
| `crosshair.*.text.backgroundColor` | `--surface-2` |
| `{xAxis,yAxis}.axisLine.color` | `--border` |
| `{xAxis,yAxis}.tickText.color` | `--text-faint` |

The custom indicators (`JournalVWAP`) and overlays (`vwapDot`, `tradeRationaleTag`,
`labeledLevel`, `pill`) are color-driven by per-overlay style props at
`createOverlay()` call sites — those call sites swap their hex literals for
`getComputedStyle(root).getPropertyValue('--profit').trim()` etc., resolved
once per render. Per FR-010 mappings: VWAP polyline = `--warn`; OR Hi/Lo lines =
`--profit` / `--loss`; entry-dot border = `--accent`; exit-dot border by
exit_reason = `--profit` / `--loss` / `--text-faint`; last-close = price-direction
green/red (current behavior).

### Rationale

- Avoids rewriting any overlay registration. All ~1400 lines of overlay logic
  in `price-chart.tsx` keep working; only the color-source changes.
- KLineCharts v10-beta2 doesn't natively read CSS variables (it's a Canvas
  renderer; it needs concrete color strings). Resolving variables once per
  render via `getComputedStyle` is cheap (single read per useEffect run).
- Centralizing the resolve in a small helper (`resolveToken(name: string)`)
  also lets theme changes re-trigger the chart's color refresh: subscribe to
  the theme value via `useTheme`, recompute colors on change.

### Alternatives considered

- **Pass raw hex from React state**: forces every theme change to thread color
  literals through props. Higher churn.
- **Use Canvas filters / mix-blend-mode**: chart-rendering-engine territory;
  overkill.
- **Swap to lightweight-charts** (which supports CSS variables natively): rejected
  in pre-spec brainstorm. Would invalidate today's KLineCharts work.

---

## R5 — Rejection cluster algorithm: how to collapse consecutive same-reason rejections

### Decision

Write a pure function `clusterRejections(rejectionRows)` in
`frontend/src/lib/rejection-clusters.ts` that takes an array of journal rows
filtered to `status === "rejected"`, sorts by timestamp, and walks them once:

```ts
interface RejectionCluster {
  rejection_check: string;          // e.g. "position_value_exceeds_cap"
  first_timestamp: string;          // ISO
  last_timestamp: string;           // ISO
  timestamps: string[];             // every member ts in order
  count: number;                    // timestamps.length
}

function clusterRejections(
  rows: JournalRowView[],
  bars: BarView[],
): RejectionCluster[];
```

Two rejections are in the same cluster iff:
1. They share the same `rejection_check`.
2. Their bar indices are consecutive (a member at index `i` of `bars` and the
   next member at index `i+1` — no gap of any non-rejected bar between them).

The function returns one cluster per maximal run. A `bars` map is consulted to
resolve "consecutive bar index" so the algorithm is robust to non-uniform
timestamps (e.g., the missing 09:30 bar in one of the existing sessions).

A second function renders cluster overlays:

```ts
function registerRejectionClusterOverlay(): void  // klinecharts registerOverlay
function createRejectionClusterOverlays(chart, clusters): string[] // returns overlay ids
```

Each cluster overlay draws a small grey tag (`Rej` or `Rej · ×N`) anchored
above the first bar of the cluster. Hover reveals the timestamps via a
custom tooltip rendered by the overlay itself.

### Rationale

- Pure function + DOM-free → trivially testable with `vitest`, no
  `@testing-library/react` overhead. Matches the `journal-markers`,
  `entry-rationale`, `exit-rationale`, `swing-pivots` pattern already
  established in `frontend/src/lib/`.
- Indexing through `bars` (not just timestamps) avoids edge cases like missing
  bars or sessions that span weekends.
- Per FR-008 + the clarified cluster semantics: this is the simplest correct
  implementation. No optimization needed — N is at most a few hundred.

### Alternatives considered

- **Cluster by timestamp delta only**: brittle to gaps; depends on
  timeframe-specific tolerances.
- **Render all rejections, no clustering**: rejected in `/speckit-clarify` Q2;
  fails the visual-legibility requirement at scale.
- **Cap at N visible per session**: rejected — loses signal on busy sessions.

---

## R6 — Toast collision policy: queue, replace, or stack

### Decision

**Replace.** A new toast trigger immediately replaces the current toast. The
toast component is a singleton React portal driven by a module-level controller
(`frontend/src/lib/toast-controller.ts`) that exposes `fireToast(message)` and
returns void. Internally:

- Each call clears any pending dismiss timer.
- Sets the visible message.
- Schedules a new dismiss after ~2.2s (matching the handoff's prototype timing).
- Re-trigger before dismiss resets the timer + replaces the message.

The component subscribes to controller state via a tiny `useSyncExternalStore`
pattern (or `useState` + event emitter — either is fine; the controller exposes
`subscribe` / `getSnapshot`).

### Rationale

- The user's pattern of triggering runs (new backtest / preset / customize) is
  unlikely to be high-frequency; replace is intuitive for "latest action wins."
- Avoids the stack-overflow visual that two stacked toasts would produce
  (the design specifies a single bottom-center pill).
- Module-level controller pattern avoids prop-drilling and matches the
  React 19 `use*` ergonomics.

### Alternatives considered

- **Queue**: requires a visible queue indicator or delayed second toast that
  may surprise the user.
- **Stack**: visually messy at bottom-center.
- **React context with provider in `App.tsx`**: more boilerplate, no benefit
  over the controller-singleton pattern.

---

## R7 — Skeleton placeholders: shape-matched vs generic

### Decision

Render shape-matched skeletons that mirror each section's final layout:
- **Run header skeleton**: short rectangle for the title row + a row of three
  pill-shaped placeholders for meta items.
- **Config card skeleton**: 3-column grid of 9 label/value placeholder pairs.
- **Summary card skeleton**: 4-column grid of 7 stat placeholder pairs + a
  thin meter strip.
- **Rejections card skeleton**: list of 3 row placeholders (text + bar + count).
- **Chart skeleton**: large rectangle the size of the chart-wrap container.
- **Trades table skeleton**: filter-tabs row + 5 row placeholders matching the
  table column widths.
- **Sidebar skeleton**: 4 run-item placeholders.

Skeletons use a 1.4s `pulse` animation oscillating background between
`--surface-2` and `--surface-3` (subtle, on-token). Implemented as a small
`<Skeleton>` primitive that accepts `width`, `height`, `rounded` props plus a
`className` for layout-specific composition.

### Rationale

- Shape-matched skeletons prevent layout shift when data resolves (zero CLS),
  which is the only way to meet SC-011's "no layout shift" requirement.
- A single `<Skeleton>` primitive composed differently per section keeps the
  code volume small; the per-section skeletons are presentational JSX in each
  section's loading branch.
- The 1.4s pulse rate is industry-standard (matches Skeleton.js, shadcn, etc.)
  and feels live without being distracting.

### Alternatives considered

- **One generic spinner per section**: fails SC-011's no-layout-shift criterion
  (the section grows when data arrives).
- **Single full-page spinner**: blocks any section that loaded fast; bad UX.
- **No skeleton, just blank**: fails SC-011's "skeleton within 100ms" criterion.

---

## R8 — Segmented control: native pattern vs custom

### Decision

Build a small `<SegmentedControl>` component in `frontend/src/components/`
that takes `options: { value: string; label: string }[]`, `value`, `onChange`.
Renders as `<div role="radiogroup">` with `<button role="radio">` children, plus
the design's `.seg` styling (surface-2 background, 3px inner padding, inactive
buttons transparent, active button raised). Wires `aria-checked` per option.

For the **Overview ↔ Chart focus** instance specifically, the control consumes
`useLayoutMode()` and writes to `localStorage` (per FR-006 clarification).

### Rationale

- A11y-correct: `radiogroup` + `radio` matches WAI-ARIA's recommended
  segmented-control pattern. Keyboard arrows move selection.
- The component is generic enough to reuse for future binary or N-way
  segmented controls without duplicate styling.
- Tiny — ~40 LOC; well below the threshold for needing a third-party primitive.

### Alternatives considered

- **Radix `ToggleGroup`**: heavier dep, doesn't match the design's visuals
  out of the box; would need overrides anyway.
- **Two `<button>`s with manual aria-pressed**: simpler but pushes a11y
  responsibility to every call site.

---

## R9 — `data-theme` attribute placement vs Tailwind's `dark:` variant

### Decision

Use `data-theme="dark"` / `data-theme="light"` on `<html>` (set by `useTheme`
in `lib/theme.ts`). Tailwind v4's `@custom-variant dark (&:where(.dark, .dark *))`
config already in `index.css` is replaced by
`@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *))`.
This keeps all existing `dark:` utility classes working while honoring the
design's token-source attribute.

### Rationale

- The design's `tokens.css` uses `[data-theme]` selectors, not class-based
  selectors. Matching this exactly keeps the token CSS authoritative without
  edits.
- Tailwind v4 allows redefining custom variants; the swap is one line in
  `index.css`.

### Alternatives considered

- **Use a `.dark` class on `<html>` and rewrite tokens.css to match**: would
  mean editing the handoff's authoritative file. Worse drift risk.
- **Drop Tailwind's `dark:` variant entirely**: forces every component author
  to use raw CSS-variable references in className. Higher friction.

---

## R10 — Existing test compatibility: how to avoid breaking 90 tests

### Decision

Audit each existing test in `frontend/src/components/*.test.tsx` for queries
that target:
- **Class names** — these break on restyle. Replace with `getByRole`,
  `getByLabelText`, or `getByText`-style semantic queries before restyle.
- **Specific colors / inline styles** — these may break if colors change.
  Replace with computed-value or token-aware assertions (`expect(el.style.color).toMatch(/var\(--loss\)|#f04f6a/)`).
- **DOM hierarchy** — only update when the redesign legitimately changes
  hierarchy (e.g., expanded trade detail moving from one column to three).

Per Principle IV, this audit happens as a **separate task** in `tasks.md`
BEFORE any restyle work — it's effectively a test refactor pass that brings
existing tests into compliance with the redesigned DOM ahead of the restyle.
After the audit, restyles can land without further test churn unless a
genuine DOM change is involved (then a new failing test → green pattern
applies).

### Rationale

- SC-006: "All existing frontend tests pass without modification of their
  assertions (only test data / DOM-query updates allowed where the redesign
  legitimately renames classes or restructures DOM)."
- Doing the audit upfront converts "test breakage" risk into "test refactor"
  work, which is bounded and reviewable.
- Tests targeting semantic queries (role, label) survive any styling change.
  This is the durable form.

### Alternatives considered

- **Restyle first, fix tests after**: violates Principle IV (tests-first),
  produces noisy "fix-broken-test" commits, and risks tests passing
  trivially after the audit.
- **Snapshot tests**: rejected — they pass by mere stability, not by
  asserting behavior. Don't strengthen the safety net.

---

## R11 — `Show rejections` chart-card / Rejections-card sync

### Decision

Lift the `showRejections` boolean state to `run-viewer.tsx` (already its
current home). Both controls (the new chart-card header button + the existing
Rejections-card button) receive `showRejections` + `onToggle` as props. No
context needed — the two consumers are siblings under one parent.

### Rationale

- The state already lives at this level. No refactor needed.
- A11y: each button reflects `aria-pressed` against the shared state.
- Future-proof: if a third surface ever needs the same state, a `useShowRejections`
  hook can be extracted without a breaking change.

### Alternatives considered

- **Local state in each component + event bus**: introduces coupling without
  benefit.
- **Context provider**: overkill for two consumers.

---

## R12 — Backdrop-filter fallback for older Safari

### Decision

The sticky topbar uses `background: color-mix(in srgb, var(--bg-app) 88%, transparent)`
+ `backdrop-filter: blur(14px)`. The base CSS includes a `@supports not (backdrop-filter: blur(1px))`
override that sets `background: var(--bg-app)` (full opacity, no blur). This
ensures the topbar remains contrast-correct against scrolling content in
browsers without blur support.

### Rationale

- `@supports` is the standard pattern; works in every browser we care about.
- The fallback matches the design's intent (a solid surface that stays
  legible over scrolling content) without the visual flourish.
- No JS feature-detection needed.

### Alternatives considered

- **Always solid background**: drops the design's intended visual treatment in
  modern browsers without need.
- **Polyfill `backdrop-filter`**: not viable; CSS-engine feature.

---

## Resolved unknowns recap

| Unknown | Resolution |
|---|---|
| Token migration approach | Replace shadcn entirely (R1) |
| Theme flicker prevention | `.theme-no-anim` class for 2 rAF (R2) |
| Font hosting | Google Fonts CDN with `display=swap` (R3) |
| KLineCharts theming | Token-resolved color values into existing style props (R4) |
| Rejection clustering | Pure function in `lib/`, bar-index aware (R5) |
| Toast collision | Replace policy, controller singleton (R6) |
| Skeleton strategy | Shape-matched per section, single `<Skeleton>` primitive (R7) |
| Segmented control | Custom component, ARIA radiogroup pattern (R8) |
| Theme attribute | `data-theme` on `<html>`, Tailwind custom variant remapped (R9) |
| Existing test compatibility | Pre-restyle test-audit pass; semantic queries (R10) |
| `Show rejections` sync | Lift state to `run-viewer.tsx`, prop-drill (R11) |
| `backdrop-filter` fallback | `@supports` rule with opaque background (R12) |

All NEEDS CLARIFICATION items from the plan's Technical Context are resolved.
Phase 0 complete.
