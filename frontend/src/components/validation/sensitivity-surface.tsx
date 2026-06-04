import { HelpTooltip } from "../help-tooltip";
import type { SensitivityPoint, SensitivitySurface as Surface } from "@/api/types";

// Feature 011 (US2): dependency-free heatmap of a parameter-sensitivity grid.
// Prefer a broad plateau over a lone spike (the peak is marked, but a single
// bright cell surrounded by poor neighbors is the overfit warning sign).

function _shortKnob(path: string): string {
  return path.split(".").pop() ?? path;
}

function _color(metric: number | null, lo: number, hi: number): string {
  if (metric == null || hi === lo) return "var(--surface-2, #2a2a2a)";
  const t = Math.max(0, Math.min(1, (metric - lo) / (hi - lo))); // 0..1
  // red (low) → amber → green (high)
  const hue = 0 + t * 130;
  return `hsl(${hue} 55% 32%)`;
}

function Cell({ p, lo, hi, peak }: { p: SensitivityPoint; lo: number; hi: number; peak: boolean }) {
  return (
    <div
      data-testid="surface-cell"
      data-peak={String(peak)}
      data-low-confidence={String(p.low_confidence)}
      title={Object.entries(p.coords).map(([k, v]) => `${_shortKnob(k)}=${v}`).join(", ")}
      style={{
        background: _color(p.metric, lo, hi),
        border: peak ? "2px solid var(--profit)" : "1px solid var(--border)",
        borderRadius: "var(--r-sm, 4px)",
        padding: "var(--sp-3, 8px)",
        textAlign: "center",
        color: "var(--text)",
        minWidth: 56,
      }}
    >
      <span className="mono">{p.metric == null ? "—" : p.metric.toFixed(2)}</span>
      {p.low_confidence ? <span title="thin sample — noisy"> ⚠</span> : null}
    </div>
  );
}

export function SensitivitySurface({ surface }: { surface: Surface }) {
  const points = surface.points ?? [];
  const metrics = points.map((p) => p.metric).filter((m): m is number => m != null);
  const lo = metrics.length ? Math.min(...metrics) : 0;
  const hi = metrics.length ? Math.max(...metrics) : 0;
  const peakRunId = points.reduce<SensitivityPoint | null>(
    (best, p) => (p.metric != null && (best == null || p.metric > (best.metric ?? -Infinity)) ? p : best),
    null
  )?.run_id;

  const header = (
    <header className="card-head">
      <h3 className="card-title">
        <span className="card-accent" style={{ background: "var(--info)" }} />
        Parameter sensitivity <HelpTooltip helpKey="parameter_sensitivity" />
        <span style={{ marginLeft: 6 }}>
          <HelpTooltip helpKey="plateau_vs_peak" />
        </span>
      </h3>
    </header>
  );

  if (points.length === 0) {
    return (
      <section className="card">
        {header}
        <div className="rej-row">
          <span className="rej-label">No grid points — the sweep produced no evaluations.</span>
        </div>
      </section>
    );
  }

  const [xKnob, yKnob] = surface.knobs;
  const xVals = surface.axes[xKnob] ?? [];
  const find = (x: number, y?: number) =>
    points.find((p) => p.coords[xKnob] === x && (yKnob ? p.coords[yKnob] === y : true));

  return (
    <section className="card">
      {header}
      <div className="stat-label">
        {surface.metric_name} · segment: {surface.segment}
      </div>
      {yKnob ? (
        // 2-D grid: rows = yVals, columns = xVals.
        <div style={{ display: "grid", gap: 4, gridTemplateColumns: `auto repeat(${xVals.length}, 1fr)`, marginTop: 8 }}>
          <div />
          {xVals.map((x) => (
            <div key={`xh-${x}`} className="stat-label mono" style={{ textAlign: "center" }}>{x}</div>
          ))}
          {(surface.axes[yKnob] ?? []).map((y) => (
            <FragmentRow key={`row-${y}`} y={y} xVals={xVals} find={find} lo={lo} hi={hi} peakRunId={peakRunId} yLabel={String(y)} />
          ))}
        </div>
      ) : (
        // 1-D row.
        <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          {xVals.map((x) => {
            const p = find(x);
            return p ? <Cell key={`c-${x}`} p={p} lo={lo} hi={hi} peak={p.run_id === peakRunId} /> : null;
          })}
        </div>
      )}
      <div className="stat-label mono" style={{ marginTop: 8 }}>{_shortKnob(xKnob)}{yKnob ? ` × ${_shortKnob(yKnob)}` : ""}</div>
    </section>
  );
}

function FragmentRow({
  y, xVals, find, lo, hi, peakRunId, yLabel,
}: {
  y: number;
  xVals: number[];
  find: (x: number, y?: number) => SensitivityPoint | undefined;
  lo: number;
  hi: number;
  peakRunId?: string;
  yLabel: string;
}) {
  return (
    <>
      <div className="stat-label mono" style={{ alignSelf: "center" }}>{yLabel}</div>
      {xVals.map((x) => {
        const p = find(x, y);
        return p ? (
          <Cell key={`c-${x}-${y}`} p={p} lo={lo} hi={hi} peak={p.run_id === peakRunId} />
        ) : (
          <div key={`e-${x}-${y}`} data-testid="surface-cell" data-peak="false" data-low-confidence="false">—</div>
        );
      })}
    </>
  );
}
