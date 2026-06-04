import { HelpTooltip } from "../help-tooltip";
import type { WalkForwardResult, WindowMetrics } from "@/api/types";

// Feature 011 (US1): per-window in-sample vs out-of-sample table. A large
// negative OOS−IS gap is the overfitting signature — those windows are flagged.

function fmt(v: number | null | undefined, prefix = "$"): string {
  if (v == null) return "—";
  const sign = v < 0 ? "-" : "";
  return `${sign}${prefix}${Math.abs(v).toFixed(2)}`;
}

function cell(m: WindowMetrics) {
  return (
    <span className="mono">
      {fmt(m.expectancy_dollars)}
      {m.low_confidence ? <span title="thin sample — noisy"> ⚠</span> : null}
    </span>
  );
}

export function WalkForwardTable({
  result,
  overfitGapWarn = 0.1,
}: {
  result: WalkForwardResult;
  // |expectancy-R gap| beyond which a window is flagged likely-overfit (T067).
  overfitGapWarn?: number;
}) {
  const windows = result.windows ?? [];
  return (
    <section className="card">
      <header className="card-head">
        <h3 className="card-title">
          <span className="card-accent" style={{ background: "var(--info)" }} />
          Walk-forward <HelpTooltip helpKey="walk_forward" />
        </h3>
      </header>

      {windows.length === 0 ? (
        <div className="rej-row">
          <span className="rej-label">No windows — study produced no walk-forward windows.</span>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Window</th>
              <th>
                In-sample <HelpTooltip helpKey="in_sample" />
              </th>
              <th>
                Out-of-sample <HelpTooltip helpKey="out_of_sample" />
              </th>
              <th>
                Gap <HelpTooltip helpKey="is_oos_gap" />
              </th>
            </tr>
          </thead>
          <tbody>
            {windows.map((w) => {
              const gapR = w.gap?.expectancy_r;
              const overfit = gapR != null && gapR < -overfitGapWarn;
              return (
                <tr
                  key={w.window_index}
                  data-testid="wf-window-row"
                  data-overfit={String(overfit)}
                  style={overfit ? { background: "color-mix(in srgb, var(--loss) 12%, transparent)" } : undefined}
                >
                  <td className="mono">
                    {w.window_index}
                    {overfit ? <span title="likely overfit"> ⚠</span> : null}
                  </td>
                  <td>{cell(w.in_sample)}</td>
                  <td>{cell(w.out_of_sample)}</td>
                  <td
                    className="mono"
                    style={{
                      color:
                        w.gap?.expectancy_dollars != null && w.gap.expectancy_dollars < 0
                          ? "var(--loss)"
                          : "var(--profit)",
                    }}
                  >
                    {fmt(w.gap?.expectancy_dollars)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="wf-aggregate" style={{ display: "flex", gap: "var(--sp-5)", marginTop: "var(--sp-4)" }}>
        <div data-testid="wf-mean-oos" className="stat">
          <div className="stat-label">Mean OOS expectancy</div>
          <div className="stat-value mono">{fmt(result.mean_oos?.expectancy_dollars)}</div>
        </div>
        <div data-testid="wf-mean-gap" className="stat">
          <div className="stat-label">Mean gap (OOS − IS)</div>
          <div className="stat-value mono">{fmt(result.mean_gap?.expectancy_dollars)}</div>
        </div>
      </div>
    </section>
  );
}
