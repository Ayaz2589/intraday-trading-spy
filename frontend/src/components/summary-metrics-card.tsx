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

// Feature 010 formatters — null/undefined render as an em dash so degenerate
// (e.g. zero-trade) and pre-010 runs never show a misleading 0.
const money = (v: number | null | undefined) =>
  v == null ? "—" : `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
const num = (v: number | null | undefined, d = 2) => (v == null ? "—" : v.toFixed(d));
const pct = (v: number | null | undefined) =>
  v == null ? "—" : `${(v * 100).toFixed(2)}%`;
const signTone = (v: number | null | undefined): "profit" | "loss" | null =>
  v == null || v === 0 ? null : v > 0 ? "profit" : "loss";

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
        {/* Feature 010: net-of-cost edge-quality metrics */}
        <Stat
          label="Expectancy"
          value={summary.expectancy_r == null ? "—" : `${num(summary.expectancy_r, 3)}R`}
          helpKey="expectancy"
          tone={signTone(summary.expectancy_r)}
        />
        <Stat
          label="Sharpe"
          value={num(summary.sharpe, 2)}
          helpKey="sharpe"
          tone={signTone(summary.sharpe)}
        />
        <Stat
          label="Sortino"
          value={num(summary.sortino, 2)}
          helpKey="sortino"
          tone={signTone(summary.sortino)}
        />
        <Stat
          label="Max DD ($)"
          value={money(summary.max_drawdown_dollars)}
          helpKey="drawdown_money"
          tone={summary.max_drawdown_dollars ? "loss" : null}
        />
        <Stat
          label="Max DD (%)"
          value={pct(summary.max_drawdown_pct)}
          helpKey="drawdown_pct"
          tone={summary.max_drawdown_pct ? "loss" : null}
        />
        <Stat
          label="Median Trade"
          value={money(summary.return_median_dollars)}
          helpKey="return_distribution"
          tone={signTone(summary.return_median_dollars)}
        />
        <Stat
          label="Slippage"
          value={money(summary.total_slippage_dollars)}
          helpKey="slippage"
          tone={summary.total_slippage_dollars ? "loss" : null}
        />
        <Stat
          label="Fees"
          value={money(summary.total_fees_dollars)}
          helpKey="fees"
          tone={summary.total_fees_dollars ? "loss" : null}
        />
        {/* Feature 010 / US3: sample size + significance */}
        <Stat
          label="Sample (N)"
          value={
            <>
              {summary.total_trades}
              {summary.low_confidence ? (
                <span className="noise-badge" style={{ color: "var(--loss)" }}>
                  {" "}
                  ⚠ noise
                </span>
              ) : null}
            </>
          }
          helpKey="sample_size"
        />
        <Stat
          label="Win-rate 95% CI"
          value={
            summary.win_rate_ci_low == null || summary.win_rate_ci_high == null
              ? "—"
              : `${(summary.win_rate_ci_low * 100).toFixed(0)}–${(
                  summary.win_rate_ci_high * 100
                ).toFixed(0)}%`
          }
          helpKey="confidence_interval"
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
