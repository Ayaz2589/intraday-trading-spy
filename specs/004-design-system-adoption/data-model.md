# Phase 1 Data Model: Design System Adoption

**Plan**: [plan.md](./plan.md)  
**Research**: [research.md](./research.md)

This is a **frontend-only** feature; no backend schemas change. The "data" here
is the **client-side UI state** plus a small number of derived shapes used by
new components. All existing API types in `frontend/src/api/types.ts`
(`BarView`, `JournalRowView`, `RunManifestView`, `RunSummaryView`,
`SummaryMetricsView`, `JournalFilter`) remain unchanged.

---

## Client-side UI state

These values live in the browser and are subject to React state / `localStorage`
persistence. They do not cross the API boundary.

### Theme

```ts
type Theme = "dark" | "light";

// Persistence
localStorage["isb-theme"]: Theme | null  // null on first visit → default "dark"
```

- **Owner**: `useTheme()` in `frontend/src/lib/theme.ts`.
- **Effect**: Sets `data-theme` attribute on `document.documentElement`.
- **Transitions**: Suppresses `*` transitions for 2 rAF during flip
  (`theme-no-anim` class) — see research R2.
- **Default**: `"dark"` on first visit.

### Layout mode

```ts
type LayoutMode = "overview" | "focus";

// Persistence
localStorage["isb-layout"]: LayoutMode | null  // null on first visit → default "overview"
```

- **Owner**: `useLayoutMode()` in `frontend/src/lib/layout-mode.ts` (new).
- **Effect**: Drives the `className` on the `.content` wrapper inside
  `run-viewer.tsx` (`.content.focus` vs `.content` per the handoff's CSS).
- **Default**: `"overview"`.
- **Test contract**: switching mutates the DOM `class` on the wrapper and
  persists to `localStorage`.

### Toast

```ts
interface ToastState {
  message: string | null;   // null = no toast visible
  triggeredAt: number;      // ms since epoch; used by the dismiss timer
}
```

- **Owner**: module-level controller in `frontend/src/lib/toast-controller.ts`.
- **API**: `fireToast(message: string): void`. Internally clears any pending
  dismiss timer, sets `message`, and schedules `setMessage(null)` ~2.2s later.
- **Subscription**: React component subscribes via `useSyncExternalStore`.
- **Collision policy**: Replace (R6). A new fire resets the visible message
  and the timer.

### Show-rejections-on-chart

```ts
type ShowRejections = boolean;
```

- **Owner**: `useState` in `frontend/src/routes/run-viewer.tsx` (already exists).
- **Consumers**: chart-card header button (new) + Rejections-card button
  (existing). Both receive `showRejections` + `onToggle` as props.
- **No persistence** — resets to `false` on each route navigation, matching
  the current behavior.

---

## Derived shapes (pure functions)

### `RejectionCluster`

Produced by `clusterRejections(rows, bars)` in
`frontend/src/lib/rejection-clusters.ts`. Consumed by the new
`RejectionClusterOverlay` to render `Rej` / `Rej · ×N` tags.

```ts
interface RejectionCluster {
  rejection_check: string;     // e.g. "position_value_exceeds_cap"
  first_timestamp: string;     // ISO-8601, anchors the visual tag
  last_timestamp: string;      // ISO-8601, last bar in the cluster
  timestamps: string[];        // every member timestamp, chronological
  count: number;               // = timestamps.length; ≥ 1
}
```

**Invariants**:

- Two clusters with the same `rejection_check` MUST have a gap of at least one
  bar between them (no two consecutive same-reason rejections live in
  different clusters).
- Two clusters with adjacent bars MAY exist if their `rejection_check` differs
  (e.g., bar N is `position_value_exceeds_cap` and bar N+1 is
  `max_distance_from_vwap_exceeded`).
- `count === 1` → render as `Rej` (no count badge).
- `count > 1` → render as `Rej · ×{count}` (the badge format from the spec).

### Skeleton placeholder shape

Internal-only; not exported. Each section's loading branch renders one or
more `<Skeleton width={…} height={…} rounded={…} />` instances. The skeleton
component's only state is its `pulse` animation (CSS-driven).

```ts
interface SkeletonProps {
  width?: string | number;     // default: 100%
  height?: string | number;    // default: 14px
  rounded?: "sm" | "md" | "lg" | "pill" | "none";  // default: "md"
  className?: string;
}
```

---

## State transitions (informal state machines)

### Theme

```
Initial: read localStorage["isb-theme"] || "dark"
        │
        ▼
   ┌────────┐  click toggle      ┌────────┐
   │  dark  │ ───────────────▶  │ light  │
   │        │ ◀───────────────  │        │
   └────────┘   click toggle    └────────┘
       │                              │
       └── persist on every change ──┘
```

Transition steps:
1. Add `.theme-no-anim` to `<html>`.
2. Set `data-theme` attribute to the new value.
3. Write to `localStorage["isb-theme"]`.
4. `requestAnimationFrame(() => requestAnimationFrame(() => removeClass()))`.

### Layout mode

```
Initial: read localStorage["isb-layout"] || "overview"
        │
        ▼
   ┌──────────┐  click "Chart focus"   ┌─────────┐
   │ overview │ ────────────────────▶ │  focus  │
   │          │ ◀──────────────────── │         │
   └──────────┘  click "Overview"     └─────────┘
        │                                  │
        └── persist on every change ──────┘
```

No transition animations on the layout swap itself; sections reorder via CSS
`order:` property change (instant). SC-008 (300ms) covers the user's
perception of completion, not animation duration.

### Toast

```
Initial: { message: null, triggeredAt: 0 }
        │
        ▼   fireToast(msg)
   ┌──────────────────┐  ~2.2s elapsed   ┌─────────┐
   │ visible(message) │ ────────────────▶│  null   │
   │                  │                  │         │
   └──────────────────┘                  └─────────┘
        ▲                                     │
        │     fireToast(newMsg)               │
        └──────────────────────────────── ────┘
                (timer resets)
```

Re-fire while visible:
1. Cancel pending dismiss timer.
2. Replace `message` with new value.
3. Schedule new dismiss after ~2.2s.

### Show-rejections-on-chart

```
   ┌─────┐    toggle    ┌────┐
   │ off │ ───────────▶ │ on │
   │     │ ◀─────────── │    │
   └─────┘    toggle    └────┘
```

Two surfaces (chart-card button + Rejections-card button) both call the same
`onToggle` callback; both reflect the same `showRejections` boolean.

---

## Data flow on a typical page load

```
1. User navigates to /runs/<run_id>
       │
       ▼
2. App reads localStorage → theme + layout-mode
       │
       ▼
3. AppShell renders with data-theme + .content.{layout-mode} class
       │
       ▼
4. RunViewer mounts, fires 5 fetches in parallel:
       runs, manifest, summary, journal, bars
       │
       ▼
5. Each section renders its skeleton placeholder (within 100ms of mount)
       │
       ▼
6. As each fetch resolves, the skeleton is replaced with real content;
   layout does not shift because skeleton matches final shape.
       │
       ▼
7. If a fetch fails, that section renders <ErrorCard> with the failure reason.
   Sibling sections remain interactive.
       │
       ▼
8. User clicks "New backtest" → fireToast("New backtest queued…")
   → toast becomes visible bottom-center → 2.2s later → null.
       │
       ▼
9. User clicks "Show rejections" → showRejections = true
   → chart re-renders → clusterRejections(rejectedRows, bars) → overlay tags
   → Rejections-card button reflects the on state.
```

---

## What this feature does NOT introduce

- No new API endpoints.
- No new backend models.
- No changes to `BarView`, `JournalRowView`, `RunManifestView`,
  `RunSummaryView`, `SummaryMetricsView`, `JournalFilter` shapes.
- No new persistent storage beyond two `localStorage` keys (`isb-theme`,
  `isb-layout`), both small strings.
- No cross-route shared state (each route's state lives in its own component
  per the current pattern).
- No additions to the journal payload, rejection breakdown, or summary
  metrics. The "Show rejections on chart" overlay is derived entirely from
  existing journal rows.
