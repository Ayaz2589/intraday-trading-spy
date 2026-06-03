import { HelpTooltip } from "./help-tooltip";
import type { EquityPointView } from "@/api/legacy-types";

// Feature 010: a dependency-free SVG sparkline of account equity across the
// trade sequence. The dashed line marks the starting account value, so a curve
// above it is net profit and below is net loss.
const W = 600;
const H = 120;
const PAD = 6;

export function EquityCurve({ points }: { points: EquityPointView[] }) {
  const head = (
    <header className="card-head">
      <h3 className="card-title">
        <span className="card-accent" style={{ background: "var(--info)" }} />
        Equity Curve
        <HelpTooltip helpKey="equity_curve" />
      </h3>
    </header>
  );

  if (!points || points.length < 2) {
    return (
      <section className="card">
        {head}
        <div className="stat-label">Not enough trades to plot an equity curve.</div>
      </section>
    );
  }

  const eqs = points.map((p) => p.equity);
  const min = Math.min(...eqs);
  const max = Math.max(...eqs);
  const range = max - min || 1;
  const baseline = points[0].equity;
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - min) / range) * (H - 2 * PAD);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1].equity;
  const tone = last >= baseline ? "var(--profit)" : "var(--loss)";

  return (
    <section className="card">
      {head}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Equity curve"
        preserveAspectRatio="none"
        style={{ width: "100%", height: H }}
      >
        <line
          x1={PAD}
          x2={W - PAD}
          y1={y(baseline)}
          y2={y(baseline)}
          stroke="var(--border)"
          strokeDasharray="3 3"
        />
        <path d={path} fill="none" stroke={tone} strokeWidth={1.5} />
      </svg>
    </section>
  );
}
