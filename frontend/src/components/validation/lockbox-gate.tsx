import { HelpTooltip } from "../help-tooltip";
import type { LockboxStatus } from "@/api/types";

// Feature 011 (US4): the one-shot lockbox gate. Presentational — the route
// wires `onRun` to the mutation (and a confirm dialog for the burn override).

export function LockboxGate({
  status,
  onRun,
  running = false,
}: {
  status: LockboxStatus;
  onRun: (override: boolean) => void;
  running?: boolean;
}) {
  const net = (status.result as { total_net_pnl_dollars?: number } | null)?.total_net_pnl_dollars;
  return (
    <section className="card">
      <header className="card-head">
        <h3 className="card-title">
          <span className="card-accent" style={{ background: "var(--info)" }} />
          Lockbox <HelpTooltip helpKey="lockbox" />
        </h3>
      </header>

      <div className="stat">
        <div className="stat-label">
          Held-out window: <span className="mono">{status.lockbox_start} → {status.lockbox_end}</span>
        </div>
        <div data-testid="lockbox-state" className="stat-value" style={{ fontWeight: 700 }}>
          {status.state === "unspent" && <span style={{ color: "var(--text-muted)" }}>Unspent</span>}
          {status.state === "spent" && <span style={{ color: "var(--profit)" }}>Spent</span>}
          {status.state === "burned" && (
            <span style={{ color: "var(--loss)" }}>
              Burned / contaminated <HelpTooltip helpKey="burned_lockbox" />
            </span>
          )}
        </div>
      </div>

      {status.state === "unspent" && (
        <div style={{ marginTop: "var(--sp-4)" }}>
          <p className="stat-label">
            You get one shot. Freeze your candidate config and run it once on data it has never seen.
          </p>
          <button type="button" className="btn btn-primary" disabled={running} onClick={() => onRun(false)}>
            {running ? "Running…" : "Run the one-shot lockbox test"}
          </button>
        </div>
      )}

      {status.state === "spent" && (
        <div style={{ marginTop: "var(--sp-4)" }}>
          <div className="stat-label">
            Recorded net P&L: <span className="mono">{net == null ? "—" : `$${net.toFixed(2)}`}</span>
          </div>
          <div className="stat-label mono">config: {status.config_fingerprint?.slice(0, 12)}…</div>
          <p className="stat-label" style={{ marginTop: 8 }}>
            A different config is blocked. You may deliberately <strong>override &amp; burn</strong>{" "}
            <HelpTooltip helpKey="burned_lockbox" /> — this permanently contaminates the lockbox.
          </p>
          <button type="button" className="btn btn-ghost" disabled={running} onClick={() => onRun(true)}>
            Override &amp; burn
          </button>
        </div>
      )}

      {status.state === "burned" && (
        <div className="rej-row" style={{ marginTop: "var(--sp-4)", color: "var(--loss)" }}>
          The lockbox has been contaminated — its results can no longer be trusted as a clean
          out-of-sample test.
        </div>
      )}
    </section>
  );
}
