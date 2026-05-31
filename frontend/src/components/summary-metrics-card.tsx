import { HelpTooltip } from "./help-tooltip";
import type { SummaryMetricsView } from "@/api/legacy-types";
import type { HelpContentKey } from "./help-content";

// SummaryMetricsCard — restyled per design handoff's .card + .summary-grid + .win-meter.
// Spec FR-016 (--info accent rail), FR-017 (win-rate meter).
function Stat({
  label,
  value,
  helpKey,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  helpKey: HelpContentKey;
  tone?: "profit" | "loss" | null;
}) {
  return (
    <div className="stat">
      <div className="stat-label">
        {label}
        <HelpTooltip helpKey={helpKey} />
      </div>
      <div
        className="stat-value stat-big mono"
        style={tone ? { color: `var(--${tone})` } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

export function SummaryMetricsCard({ summary }: { summary: SummaryMetricsView }) {
  const pf = summary.profit_factor;
  const winPct = (summary.win_rate * 100).toFixed(1);
  const winPctNumber = summary.win_rate * 100;
  return (
    <section className="card">
      <header className="card-head">
        <h3 className="card-title">
          <span className="card-accent" style={{ background: "var(--info)" }} />
          Summary
        </h3>
      </header>
      <div className="summary-grid">
        <Stat
          label="Total Trades"
          value={summary.total_trades}
          helpKey="risk_per_trade"
        />
        <Stat
          label="W / L"
          value={
            <>
              <span style={{ color: "var(--profit)" }}>{summary.wins}</span>
              <span className="sep"> / </span>
              <span style={{ color: "var(--loss)" }}>{summary.losses}</span>
            </>
          }
          helpKey="win_rate"
        />
        <Stat label="Win Rate" value={`${winPct}%`} helpKey="win_rate" />
        <Stat
          label="Average R"
          value={summary.average_r.toFixed(3)}
          helpKey="r_multiple"
          tone={
            summary.average_r > 0
              ? "profit"
              : summary.average_r < 0
                ? "loss"
                : null
          }
        />
        <Stat
          label="Total R"
          value={
            (summary.total_r >= 0 ? "+" : "") + summary.total_r.toFixed(3)
          }
          helpKey="r_multiple"
          tone={summary.total_r >= 0 ? "profit" : "loss"}
        />
        <Stat
          label="Max Drawdown"
          value={`${summary.max_drawdown_r.toFixed(3)}R`}
          helpKey="max_drawdown"
          tone="loss"
        />
        <Stat
          label="Profit Factor"
          value={pf == null ? "—" : pf.toFixed(3)}
          helpKey="profit_factor"
        />
        <div className="win-meter-cell">
          <div className="stat-label">Win rate</div>
          <div
            className="win-meter"
            role="progressbar"
            aria-label="Win rate"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={winPctNumber}
          >
            <span style={{ width: `${winPct}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}
