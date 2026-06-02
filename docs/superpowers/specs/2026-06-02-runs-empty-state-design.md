# Runs Page: Design-System Empty State — Design

**Date**: 2026-06-02
**Status**: Approved — implementation via direct TDD off this doc
**Topic**: Replace the bare runs-landing empty state with a polished
design-system empty state whose CTA opens the topbar run launcher.

---

## 1. Motivation

When a user has no backtests, `/_authenticated/runs` shows a minimal centered
text block (`runs-landing-empty`) built from inline styles, with no card, icon,
or actionable button. The loading state above it still uses the dead
`text-muted-foreground` class (undefined in this Tailwind v4 + token setup), and
its copy ("open the Strategy dropdown… click Run backtest") diverges from the
sidebar's empty state, which points at the `make backtest` CLI.

Goal: a polished, on-brand empty state with a real primary CTA that opens the
run launcher — so a new user can start their first backtest in one click.

## 2. Goals / Non-goals

**Goals**
- Polished design-system empty state: centered `.card`, accent-soft icon badge,
  clear heading + educational subtext, primary CTA button.
- CTA "Run your first backtest" opens the topbar's `StrategyConfigDropdown`
  (the modern `useStartBacktest` launcher).
- Fix the loading state's dead class; align copy with the sidebar
  (`make backtest` shown as a secondary option).
- Preserve the `runs-landing-empty` test hook.

**Non-goals**
- No change to run-creation logic, the dropdown's form, routing, or `useRuns`.
- Not touching the legacy `ConfigureRunMenu` / `run-viewer` path.
- No backend changes. No new help-content keys (existing empty states carry no
  tooltip — follow precedent; the copy itself is educational, Constitution VI).

## 3. Architecture

The landing renders inside the `_authenticated` shell (`AuthenticatedTopbar` +
`SideNav` + scrolling `<main>`). The launcher (`StrategyConfigDropdown`) lives in
the topbar and owns its `open` state internally, so the empty-state CTA (in
`<main>`) needs a cross-tree signal to open it. We mirror the existing
`toast-controller` singleton idiom rather than prop-drill through the shell.

### 3a. `lib/strategy-menu-controller.ts` (new)
Module-level subscribable signal, shaped exactly like `toast-controller`:
- `openStrategyMenu(): void` — bumps an internal request counter, notifies.
- `subscribe(listener): () => void`
- `getSnapshot(): number` — the request counter (monotonic).

### 3b. `StrategyConfigDropdown` (modify, ~4 lines)
```ts
const openRequest = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
useEffect(() => { if (openRequest > 0) setOpen(true) }, [openRequest])
```
On each `openStrategyMenu()` the counter increments → effect re-runs →
`setOpen(true)`. Guarded by `> 0` so mount (counter 0) doesn't auto-open.

### 3c. `components/runs/RunsEmptyState.tsx` (new, presentational)
Props: `{ onCreateRun: () => void }`. Renders:
- centered container (fills `<main>`, `place-items: center`),
- a `.card` (`max-width ~440px`, `text-align: center`),
- accent-soft circular icon badge with a lucide icon (`LineChart`),
- `<h2>` "No backtests yet" (`--fs-xl`, weight 700),
- subtext (`--text-muted`): "Backtests replay SPY 5-minute bars through your
  strategy so you can study entries, exits, and rejections.",
- primary CTA `button.btn.btn-primary` with a `Play` icon, label
  "Run your first backtest", `onClick={onCreateRun}`,
- secondary muted line: "Prefer the terminal?" + `make backtest` in a mono chip.

### 3d. `routes/_authenticated.runs.tsx` (modify)
- Render `<RunsEmptyState onCreateRun={openStrategyMenu} />` in the empty branch,
  keeping `data-testid="runs-landing-empty"` on its container.
- Loading branch: drop `text-muted-foreground`; use a token-driven muted line
  (`color: var(--text-muted)`), keep `runs-landing-loading`.
- Redirect-to-first-run and loading logic unchanged.

## 4. Styling

Reuses existing design-system classes (`.card`, `.btn`, `.btn-primary`, `.mono`)
and tokens. One small reusable addition to the AUTH/extension area of
`globals.css` only if needed: an `.empty-state` layout helper + `.icon-badge`
(accent-soft circle). Prefer reusing existing classes; add the badge style
inline-via-tokens or as a tiny class — kept token-driven, no hardcoded colors.

## 5. Testing (TDD)

- `lib/strategy-menu-controller.test.ts` — `openStrategyMenu()` increments the
  snapshot and invokes subscribers; `subscribe` returns a working unsubscribe.
- `components/runs/RunsEmptyState.test.tsx` — renders heading + CTA; clicking the
  CTA calls `onCreateRun`.
- `StrategyConfigDropdown` open-on-signal: a ~4-line wire-up over a hook-heavy
  component; covered by the controller test + typecheck/build rather than mocking
  its full query layer. Flagged, not silently skipped.

Verification gate: `npm run test` (no new failures beyond the pre-existing
`price-chart` ones), `npm run typecheck`, `npm run build` all green.

## 6. Constitution check

- **IV (TDD):** controller + empty-state tests written first. ✔
- **VI (educational UI):** empty-state copy explains what a backtest is; follows
  the no-tooltip precedent of existing empty states. ✔
- SPY-only / risk-veto / paper-first / journaling untouched (presentational +
  a UI open-signal). ✔
