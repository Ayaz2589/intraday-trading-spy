import { HelpTooltip } from "./help-tooltip";
import { humanize } from "@/lib/format";
import type { HelpContentKey } from "./help-content";

const HELP_BY_REASON: Partial<Record<string, HelpContentKey>> = {
  position_value_exceeds_cap: "position_cap",
  cooldown_active: "cooldown",
  daily_loss_limit_reached: "lockout",
};

// RejectionBreakdownCard — restyled per design handoff's .card + .rej-list.
// Spec FR-016 (--warn accent rail), FR-008 (Show on chart toggle wired
// to chart-side button via shared state in run-viewer.tsx).
export function RejectionBreakdownCard({
  breakdown,
  total,
  show,
  onToggle,
}: {
  breakdown: Record<string, number>;
  total: number;
  show?: boolean;
  onToggle?: () => void;
}) {
  const items = Object.entries(breakdown).sort(([, a], [, b]) => b - a);
  const max = items.length ? Math.max(...items.map(([, c]) => c)) : 1;

  return (
    <section className="card">
      <header className="card-head">
        <h3 className="card-title">
          <span className="card-accent" style={{ background: "var(--warn)" }} />
          Rejections <span className="count-pill mono">{total}</span>
          <HelpTooltip helpKey="rejected_signal" />
        </h3>
        {onToggle && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              className={`btn btn-ghost btn-sm${show ? " is-on" : ""}`}
              aria-pressed={!!show}
              onClick={onToggle}
            >
              {show ? "Hide" : "Show"} on chart
            </button>
            <HelpTooltip helpKey="show_rejections" />
          </span>
        )}
      </header>
      {items.length === 0 ? (
        <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)" }}>
          No rejections.
        </p>
      ) : (
        <div className="rej-list" role="list">
          {items.map(([reason, count]) => {
            const helpKey = HELP_BY_REASON[reason];
            return (
              <div key={reason} className="rej-row" role="listitem">
                <div className="rej-reason">
                  {humanize(reason)}
                  {helpKey && <HelpTooltip helpKey={helpKey} />}
                </div>
                <div className="rej-bar">
                  <span style={{ width: `${(count / max) * 100}%` }} />
                </div>
                <div className="rej-count mono">{count}</div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
