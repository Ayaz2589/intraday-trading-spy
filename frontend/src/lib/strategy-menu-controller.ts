// Module-level subscribable signal to open the Strategy & Run launcher
// (StrategyConfigDropdown) from outside the topbar — e.g. the runs empty
// state's "Run your first backtest" CTA. Mirrors the toast-controller idiom:
// an imperative fire + useSyncExternalStore-friendly subscribe/getSnapshot.
//
// The snapshot is a monotonic request counter: each openStrategyMenu() bumps
// it so subscribers (via useSyncExternalStore) re-render and can react to the
// new request, even for repeated opens.

let openRequests = 0;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

/** Request that the Strategy/Run launcher popover open. */
export function openStrategyMenu(): void {
  openRequests += 1;
  notify();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): number {
  return openRequests;
}
