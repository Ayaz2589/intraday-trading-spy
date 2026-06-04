import { HelpTooltip } from "../help-tooltip";
import type { SignificanceResult } from "@/api/types";

// Feature 011 (US3): bootstrap CIs + the random-entry permutation verdict.

function fmt(v: number | null | undefined): string {
  return v == null ? "—" : v.toFixed(2);
}

export function SignificancePanel({ result }: { result: SignificanceResult }) {
  const undetermined = result.p_value == null;
  const verdict = undetermined
    ? "Undetermined (insufficient data)"
    : result.significant
      ? "Significant"
      : "Not significant";
  const tone = undetermined ? "var(--text-muted)" : result.significant ? "var(--profit)" : "var(--loss)";

  return (
    <section className="card">
      <header className="card-head">
        <h3 className="card-title">
          <span className="card-accent" style={{ background: "var(--info)" }} />
          Significance
        </h3>
      </header>

      <div className="stat" style={{ marginBottom: "var(--sp-4)" }}>
        <div className="stat-label">
          Permutation test <HelpTooltip helpKey="permutation_test" />
        </div>
        <div
          data-testid="significance-verdict"
          className="stat-value"
          style={{ color: tone, fontWeight: 700 }}
        >
          {verdict}
          {!undetermined ? (
            <span className="mono" style={{ marginLeft: 8, fontWeight: 400 }}>
              p = {result.p_value!.toFixed(3)} (α = {result.alpha})
            </span>
          ) : null}
        </div>
      </div>

      <div className="stat-label">
        Bootstrap {Math.round(result.confidence * 100)}% confidence intervals{" "}
        <HelpTooltip helpKey="bootstrap_ci" />
      </div>
      <table className="data-table">
        <tbody>
          {result.bootstrap.map((ci) => (
            <tr key={ci.statistic}>
              <td>{ci.statistic}</td>
              <td className="mono">{fmt(ci.point)}</td>
              <td className="mono">
                [{fmt(ci.low)}, {fmt(ci.high)}]
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
