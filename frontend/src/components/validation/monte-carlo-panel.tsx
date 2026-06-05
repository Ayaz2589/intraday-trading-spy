import { HelpTooltip } from "../help-tooltip";
import type { MonteCarloDistribution, MonteCarloResult } from "@/api/types";

// Feature 015 (US1): drawdown / path-risk distributions from reshuffling the
// run's REAL trades. Drawdown pct arrives as a fraction of the running peak
// (backend metrics.py convention) and renders as a percent.

const pct = (f: number) => `${(f * 100).toFixed(1)}%`;
const usd = (v: number) => `$${Math.round(v).toLocaleString()}`;
const int = (v: number) => `${Math.round(v)}`;

// The API ships percentiles (not raw samples), so the honest visual is a
// box-plot-style strip: P5–P95 band, darker P25–P75 core, P50 tick, and the
// observed value as a dot — you can see at a glance where your actual curve
// sits inside the simulated distribution.
function DistributionStrip({ dist }: { dist: MonteCarloDistribution }) {
  const lo = Math.min(dist.p5, dist.observed);
  const hi = Math.max(dist.p95, dist.observed);
  const span = hi - lo || 1;
  const x = (v: number) => ((v - lo) / span) * 96 + 2;
  return (
    <svg
      data-testid="mc-distribution-strip"
      viewBox="0 0 100 12"
      preserveAspectRatio="none"
      style={{ width: 120, height: 12, display: "block" }}
      aria-hidden
    >
      <rect
        x={x(dist.p5)} y={4}
        width={Math.max(x(dist.p95) - x(dist.p5), 0.5)} height={4}
        fill="var(--border-strong)" rx={2}
      />
      <rect
        x={x(dist.p25)} y={4}
        width={Math.max(x(dist.p75) - x(dist.p25), 0.5)} height={4}
        fill="var(--text-muted)" rx={2}
      />
      <rect x={x(dist.p50) - 0.6} y={2} width={1.2} height={8} fill="var(--text)" />
      <circle cx={x(dist.observed)} cy={6} r={2.4} fill="var(--info)" />
    </svg>
  );
}

export function MonteCarloPanel({ result }: { result: MonteCarloResult }) {
  const s = result.shuffle;
  const rows = [
    {
      key: "max_drawdown_pct", label: "Max drawdown (%)",
      dist: s.max_drawdown_pct, fmt: pct,
      helpKey: "max_drawdown_distribution" as const,
    },
    {
      key: "max_drawdown_dollars", label: "Max drawdown ($)",
      dist: s.max_drawdown_dollars, fmt: usd, helpKey: null,
    },
    {
      key: "longest_losing_streak", label: "Longest losing streak",
      dist: s.longest_losing_streak, fmt: int,
      helpKey: "losing_streak" as const,
    },
    {
      key: "longest_underwater_trades", label: "Longest underwater (trades)",
      dist: s.longest_underwater_trades, fmt: int,
      helpKey: "underwater_period" as const,
    },
  ];

  return (
    <div data-testid="monte-carlo-panel" style={{ display: "grid", gap: "var(--sp-4)" }}>
      <div>
        <div className="stat-label" style={{ marginBottom: "var(--sp-2)" }}>
          Drawdown risk — {result.iterations.toLocaleString()} reshuffles of your real trades{" "}
          <HelpTooltip helpKey="shuffle_method" />
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th />
              <th>observed</th>
              <th>P50</th>
              <th>P95</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} data-testid={`mc-stat-row-${r.key}`}>
                <td>
                  {r.label} {r.helpKey ? <HelpTooltip helpKey={r.helpKey} /> : null}
                </td>
                <td className="mono" style={{ fontWeight: 700 }}>{r.fmt(r.dist.observed)}</td>
                <td className="mono">{r.fmt(r.dist.p50)}</td>
                <td className="mono">{r.fmt(r.dist.p95)}</td>
                <td>
                  <DistributionStrip dist={r.dist} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="stat-label mono" data-testid="mc-meta">
        {result.iterations.toLocaleString()} iterations · seed {result.seed} ·{" "}
        {result.trade_count} trades — rerunning reproduces these numbers exactly{" "}
        <HelpTooltip helpKey="mc_iterations_seed" />
      </div>
    </div>
  );
}
