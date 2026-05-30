// Module-level subscribable store for the singleton toast surface.
// The replace-policy (new fire resets timer + message) is per spec
// FR-007 and research R6.

export const TOAST_DURATION_MS = 2200;

export interface ToastState {
  message: string | null;
  triggeredAt: number;
}

let state: ToastState = { message: null, triggeredAt: 0 };
let dismissTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function setState(next: ToastState) {
  state = next;
  notify();
}

export function fireToast(message: string): void {
  if (dismissTimer != null) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  setState({ message, triggeredAt: Date.now() });
  dismissTimer = setTimeout(() => {
    dismissTimer = null;
    setState({ message: null, triggeredAt: 0 });
  }, TOAST_DURATION_MS);
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): ToastState {
  return state;
}
