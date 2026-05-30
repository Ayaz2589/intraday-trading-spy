import { useSyncExternalStore } from "react";
import { subscribe, getSnapshot } from "@/lib/toast-controller";

// Toast — singleton portal subscribed to the toast-controller.
// Spec FR-007 (transient run-trigger feedback). Replace-policy via
// toast-controller; this component is presentation-only.
export function Toast() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!state.message) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      <span className="toast-spinner" aria-hidden />
      <span>{state.message}</span>
    </div>
  );
}
