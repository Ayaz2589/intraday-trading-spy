import type { ReactNode } from "react";
import { HelpTooltip } from "../help-tooltip";
import type { LockboxStatus } from "@/api/types";

// Feature 011 (US4): the one-shot lockbox gate. Presentational — the route
// wires `onRun` to the mutation (and a confirm dialog for the burn override).
// Validation-page rework: renders FLAT inside the route's Lockbox section
// (no nested card repeating the title); `children` is the leading form cell
// of the header row (the candidate-config picker).

const STATE_CHIP: Record<LockboxStatus["state"], { label: string; klass: string }> = {
  unspent: { label: "Unspent", klass: "chip chip-muted" },
  spent: { label: "Spent", klass: "chip chip-profit" },
  burned: { label: "Burned / contaminated", klass: "chip chip-loss" },
};

export function LockboxGate({
  status,
  onRun,
  running = false,
  children,
}: {
  status: LockboxStatus;
  onRun: (override: boolean) => void;
  running?: boolean;
  children?: ReactNode;
}) {
  const net = (status.result as { total_net_pnl_dollars?: number } | null)?.total_net_pnl_dollars;
  const chip = STATE_CHIP[status.state];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
        {children}
        <div>
          <span style={{ display: "block", marginBottom: 3, fontSize: "var(--fs-xs, 11px)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Held-out window <HelpTooltip helpKey="lockbox" />
          </span>
          <span className="mono" style={{ fontSize: "var(--fs-sm, 13px)" }}>
            {status.lockbox_start} → {status.lockbox_end}
          </span>
        </div>
        <span data-testid="lockbox-state" className={chip.klass} style={{ marginBottom: 1 }}>
          {chip.label}
        </span>

        {status.state === "unspent" && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={running}
            onClick={() => onRun(false)}
            style={{ marginLeft: "auto" }}
          >
            {running ? "Running…" : "Run the one-shot lockbox test"}
          </button>
        )}
        {status.state === "spent" && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={running}
            onClick={() => onRun(true)}
            style={{ marginLeft: "auto" }}
          >
            Override &amp; burn
          </button>
        )}
      </div>

      {status.state === "unspent" && (
        <p className="stat-label" style={{ margin: 0 }}>
          You get one shot. Freeze your candidate config and run it once on data it has never seen.
        </p>
      )}

      {status.state === "spent" && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
          <span className="stat-label">
            Recorded net P&L: <span className="mono">{net == null ? "—" : `$${net.toFixed(2)}`}</span>
          </span>
          <span className="stat-label mono">config: {status.config_fingerprint?.slice(0, 12)}…</span>
          <span className="stat-label">
            A different config is blocked. You may deliberately <strong>override &amp; burn</strong>{" "}
            <HelpTooltip helpKey="burned_lockbox" /> — this permanently contaminates the lockbox.
          </span>
        </div>
      )}

      {status.state === "burned" && (
        <p className="stat-label" style={{ margin: 0, color: "var(--loss)" }}>
          The lockbox has been contaminated <HelpTooltip helpKey="burned_lockbox" /> — its results
          can no longer be trusted as a clean out-of-sample test.
        </p>
      )}
    </div>
  );
}
