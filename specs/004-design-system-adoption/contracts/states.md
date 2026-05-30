# State-Machine Contracts

**Plan**: [../plan.md](../plan.md)  
**Data model**: [../data-model.md](../data-model.md)

Each state machine below has invariants that the implementation MUST uphold.
These translate directly into test cases.

---

## Theme

**State**: `Theme = "dark" | "light"`

**Persistence key**: `localStorage["isb-theme"]`

**Initial state**:
```
if localStorage["isb-theme"] in {"dark", "light"}:
    return localStorage["isb-theme"]
else:
    return "dark"
```

**Transitions**:
| From | Event | To | Side effects |
|---|---|---|---|
| `dark` | `setTheme("light")` | `light` | Add `.theme-no-anim` → set `data-theme="light"` → write localStorage → 2 rAF → remove `.theme-no-anim` |
| `light` | `setTheme("dark")` | `dark` | Add `.theme-no-anim` → set `data-theme="dark"` → write localStorage → 2 rAF → remove `.theme-no-anim` |

**Invariants**:
1. The `data-theme` attribute on `<html>` ALWAYS matches the current state.
2. `localStorage["isb-theme"]` ALWAYS matches the current state after a flip.
3. The `.theme-no-anim` class is present for at most 2 animation frames.
4. The state is read once at mount; subsequent reads come from React state.

**Test cases**:
- T-THEME-1: First-visit user (no localStorage) → state is `dark`,
  `data-theme="dark"` on html.
- T-THEME-2: User toggles dark → light → state is `light`,
  `data-theme="light"`, localStorage updated.
- T-THEME-3: User toggles, reloads page → state matches pre-reload value.
- T-THEME-4: The `.theme-no-anim` class is added before the data-theme swap
  and removed within 2 rAF.

---

## Layout mode

**State**: `LayoutMode = "overview" | "focus"`

**Persistence key**: `localStorage["isb-layout"]`

**Initial state**:
```
if localStorage["isb-layout"] in {"overview", "focus"}:
    return localStorage["isb-layout"]
else:
    return "overview"
```

**Transitions**:
| From | Event | To | Side effects |
|---|---|---|---|
| `overview` | `setLayout("focus")` | `focus` | Apply `.content.focus` class → write localStorage |
| `focus` | `setLayout("overview")` | `overview` | Remove `.content.focus` class → write localStorage |

**Invariants**:
1. The `.content` element's class list contains `focus` IFF state is `focus`.
2. `localStorage["isb-layout"]` ALWAYS matches the current state after a swap.
3. The segmented control's `aria-checked` reflects the current state.

**Test cases**:
- T-LAYOUT-1: First-visit user (no localStorage) → state is `overview`.
- T-LAYOUT-2: User clicks "Chart focus" → state is `focus`, content has
  `.focus` class, localStorage updated.
- T-LAYOUT-3: User clicks "Chart focus" then reloads → state is still
  `focus` after reload.
- T-LAYOUT-4: Segmented control's `aria-checked` updates in sync.

---

## Toast

**State**: `{ message: string | null, triggeredAt: number }`

**Initial state**: `{ message: null, triggeredAt: 0 }`

**Transitions**:
| From | Event | To | Side effects |
|---|---|---|---|
| `{message: null}` | `fireToast("M")` | `{message: "M", triggeredAt: now}` | Clear any pending dismiss timer; schedule dismiss in 2.2s |
| `{message: "M"}` | `fireToast("M2")` | `{message: "M2", triggeredAt: now}` | Clear pending dismiss timer; schedule dismiss in 2.2s |
| `{message: "M"}` | (2.2s elapsed) | `{message: null}` | Component re-renders without toast |
| `{message: "M"}` | (component unmount) | `{message: null}` | Clear pending dismiss timer |

**Invariants**:
1. At most one toast is visible at any time.
2. A new `fireToast` call always replaces the visible message and resets
   the dismiss timer.
3. After the dismiss timer fires, `message` is `null` and the component
   renders nothing.

**Test cases**:
- T-TOAST-1: `fireToast("Hello")` → toast shows "Hello".
- T-TOAST-2: After ~2.2s, toast is gone.
- T-TOAST-3: `fireToast("A")` then `fireToast("B")` 0.5s later → toast
  shows "B" (not "A"); toast dismisses ~2.2s after the second fire.
- T-TOAST-4: `fireToast` twice in quick succession (within 50ms) → toast
  shows the second message; only one DOM toast is rendered at any moment.

---

## Show rejections (chart overlay)

**State**: `ShowRejections = boolean`

**Owner**: `useState` in `run-viewer.tsx` (current home; unchanged).

**Transitions**:
| From | Event | To | Side effects |
|---|---|---|---|
| `false` | `setShowRejections(true)` | `true` | Chart re-renders → `clusterRejections(...)` → register overlays |
| `true` | `setShowRejections(false)` | `false` | Chart re-renders → remove all cluster overlays |

**Invariants**:
1. The chart-card header button and the Rejections-card button BOTH reflect
   the current state.
2. Toggle from either button updates the same state.
3. Per-session: the state resets to `false` when the user navigates to a
   different run or session.

**Test cases**:
- T-REJ-1: Initial state is `false`.
- T-REJ-2: Click chart-card button → state is `true`; Rejections-card
  button shows active state.
- T-REJ-3: Click Rejections-card button → state is `false`; chart-card
  button shows inactive state.
- T-REJ-4: Switch to a different session → state resets to `false`.

---

## Rejection clustering (pure function contract)

**Function**: `clusterRejections(rows: JournalRowView[], bars: BarView[]): RejectionCluster[]`

**Inputs**:
- `rows`: journal rows filtered to `status === "rejected"`, in any order.
- `bars`: chronological bars for the current session.

**Output**: zero or more `RejectionCluster` objects (see data-model.md).

**Properties**:

1. **Group by reason**: Every cluster has a single `rejection_check` value.
   Two rows with different `rejection_check` NEVER share a cluster.
2. **Consecutive only**: Within one cluster, every member row's bar index
   is exactly one greater than the previous member's bar index.
3. **Maximal**: If two rows could be in the same cluster (same reason,
   consecutive bars), they MUST be in the same cluster.
4. **Deterministic order**: `timestamps` is chronological; clusters are
   returned in chronological order of their `first_timestamp`.
5. **Idempotent**: Calling twice with the same inputs yields equivalent
   output (deep-equal).
6. **Empty in / empty out**: `clusterRejections([], bars)` returns `[]`.
7. **No bars**: `clusterRejections(rows, [])` returns `[]` (no bar to
   anchor against).
8. **Row not in bars**: Rows whose `timestamp` doesn't match any bar are
   silently dropped (defensive; should not happen in production).

**Test cases**:
- T-CLUSTER-1: Empty input → empty output.
- T-CLUSTER-2: Single rejection → single cluster with count 1.
- T-CLUSTER-3: 3 consecutive same-reason rejections → 1 cluster, count 3,
  timestamps in order.
- T-CLUSTER-4: 3 consecutive bars, two with reason A and one with reason B
  in the middle → 3 clusters (A×1, B×1, A×1) because the run is broken.
- T-CLUSTER-5: 5 same-reason rejections with gaps (bars 1, 2, 4, 5, 6) →
  2 clusters: count 2 (bars 1–2), count 3 (bars 4–6).
- T-CLUSTER-6: Many clusters → returned in chronological `first_timestamp`
  order.
- T-CLUSTER-7: Run-viewer wiring: when `showRejections === true`, the
  chart contains exactly one overlay per cluster.

---

## Loading / error per section

**Existing pattern** (preserved): each async data section uses a
`SectionState<T> = { loading: true } | { error: string } | { data: T }`
discriminated union.

**New behavior**:
| Section state | Render |
|---|---|
| `{ loading: true }` | Shape-matched `<Skeleton>` placeholders for that section |
| `{ error: string }` | `<ErrorCard message={state.error} />` |
| `{ data: T }` | The section's normal content |

**Invariants**:
1. Each section renders **independently** — siblings are not blocked by
   one section's loading or error state.
2. Skeleton size approximates loaded content size to prevent layout shift.
3. Error card renders within the same layout area as the loaded content
   would.

**Test cases**:
- T-LOAD-1: A section with `loading: true` renders a skeleton (queryable
  via `role="presentation"`).
- T-LOAD-2: A section with `error` renders an `<ErrorCard>` with the
  error message text; `role="alert"`.
- T-LOAD-3: Three sections in three states (loading, error, data) render
  side by side correctly; no section blocks another.

---

## Cross-cutting: existing routes

**Routes** (UNCHANGED):

| Route | Component | Behavior |
|---|---|---|
| `/` | `<Root>` | Welcome / latest-run quick-link |
| `/runs/:run_id` | `<RunViewer>` | The full backtest dashboard |

**Invariants**:
1. Deep-linking to `/runs/<existing-run-id>` works exactly as before.
2. Navigating to `/runs/<missing-id>` shows a useful error (existing
   behavior — error-card-styled per this feature).
3. Browser back/forward navigation works as before.

**Test cases** (existing, must not regress):
- T-ROUTE-1: Render `<App>` at `/runs/<id>` → `<RunViewer>` mounts.
- T-ROUTE-2: Click a run in the sidebar → URL updates and `<RunViewer>`
  re-renders with the new run id.
