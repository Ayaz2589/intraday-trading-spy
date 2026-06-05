import { useState } from "react";
import { usePooledGate } from "@/hooks/useStudies";
import { ClaudeReadCard, flattenMetrics } from "../insights/ClaudeReadCard";
import { DistributionStrip } from "./monte-carlo-panel";
import { HelpTooltip } from "../help-tooltip";
import type { PooledGateResult, ValidationStudy } from "@/api/types";

// Feature 016: the pre-registered lockbox gate over a walk-forward study's
// pooled OOS windows — the productized version of the 2026-06-05 ad-hoc
// wf-rr3 run. Seeded and reproducible (unlike the advisory Claude read).

const usd = (v: number) => `$${Math.round(v).toLocaleString()}`;
const f2 = (v: number | null) => (v == null ? "—" : v.toFixed(2));

function gateOf(study: ValidationStudy): PooledGateResult | null {
  const result = study.result as { pooled_gate?: PooledGateResult | null } | null;
  return result?.pooled_gate ?? null;
}

export function PooledGatePanel({ study }: { study: ValidationStudy }) {
  const gate = gateOf(study);
  const mutation = usePooledGate(study.id);
  const [fullRunning, setFullRunning] = useState(false);

  const run = (mode: "fast" | "full") =>
    mutation.mutate(mode, {
      onSuccess: (res) => {
        if (mode === "full" && res && "status" in res) setFullRunning(true);
      },
    });

  const ci = gate?.expectancy_dollars_ci;

  return (
    <section className="card" data-testid="pooled-gate">
      <header className="card-head">
        <h3 className="card-title">
          <span className="card-accent" style={{ background: "var(--info)" }} />
          Pooled gate <HelpTooltip helpKey="pooled_gate" />
        </h3>
      </header>

      {gate && ci && (
        <div
          data-testid="gate-banner"
          style={{
            border: `1px solid ${gate.passed ? "var(--profit)" : "var(--loss)"}`,
            borderRadius: "var(--r-md)",
            padding: "var(--sp-3) var(--sp-4)",
            marginBottom: "var(--sp-4)",
          }}
        >
          <div style={{ fontWeight: 700, color: gate.passed ? "var(--profit)" : "var(--loss)" }}>
            GATE: {gate.passed ? "PASSED" : "NOT PASSED"}
          </div>
          <div className="stat-label mono">
            pooled OOS expectancy {Math.round((1 - gate.alpha) * 100)}% CI [{f2(ci.low)},{" "}
            {f2(ci.high)}] {gate.passed ? "excludes zero" : "includes zero"} — the
            pre-registered lockbox precondition
          </div>
          {gate.fisher && (
            <div className="stat-label mono" data-testid="gate-fisher">
              Fisher combined p = {gate.fisher.p.toExponential(2)} (X²=
              {gate.fisher.x2.toFixed(1)}, df={gate.fisher.df}){" "}
              <HelpTooltip helpKey="fisher_combined" />
            </div>
          )}
        </div>
      )}

      {gate && (
        <>
          <div
            data-testid="gate-stats"
            className="stat-label mono"
            style={{ display: "flex", gap: "var(--sp-5)", flexWrap: "wrap", marginBottom: "var(--sp-3)" }}
          >
            <span>{gate.pooled_trades.toLocaleString()} pooled trades</span>
            <span>OOS PnL {usd(gate.total_net_pnl_dollars)}</span>
            <span>
              exp $ {f2(gate.expectancy_dollars_ci.point)} [{f2(gate.expectancy_dollars_ci.low)},{" "}
              {f2(gate.expectancy_dollars_ci.high)}]
            </span>
            <span>
              exp R {gate.expectancy_r_ci.point?.toFixed(4) ?? "—"}
            </span>
            <span>
              windows + {gate.windows_positive} / {gate.windows_with_trades} (sign p{" "}
              {gate.sign_test_p.toFixed(3)}) <HelpTooltip helpKey="sign_test" />
            </span>
            {gate.windows_with_trades < gate.windows_total && (
              <span>
                {gate.windows_with_trades} of {gate.windows_total} windows contributed trades
              </span>
            )}
            <span style={{ color: "var(--text-muted)" }}>
              seeded · reproducible (seed {gate.seed})
            </span>
          </div>

          <div style={{ display: "flex", gap: "var(--sp-4)", alignItems: "center", marginBottom: "var(--sp-3)" }}>
            <span className="stat-label">Pooled drawdown risk</span>
            <DistributionStrip dist={gate.monte_carlo.shuffle.max_drawdown_pct} />
            <span className="stat-label mono" data-testid="gate-ruin">
              ruin{" "}
              {gate.monte_carlo.ruin
                .map((r) => `−${r.threshold_pct}%: ${(r.probability * 100).toFixed(r.probability * 100 < 10 ? 1 : 0)}%`)
                .join(" · ")}
            </span>
          </div>

          {gate.per_window_p && (
            <div
              data-testid="gate-window-ps"
              className="stat-label mono"
              style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap", marginBottom: "var(--sp-3)" }}
            >
              {gate.per_window_p.map((w) => (
                <span key={w.window_index}>
                  w{w.window_index}: p={w.p_value == null ? "—" : w.p_value.toFixed(4)}
                  {w.significant ? " ✓" : ""}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {!gate && !mutation.isError && (
        <p className="stat-label">
          Pool every out-of-sample window's trades into one decision-grade
          verdict: does the pooled expectancy confidence interval exclude zero?
        </p>
      )}

      {mutation.isError && (
        <div style={{ color: "var(--loss)" }}>
          {(mutation.error as Error)?.message ?? "Failed"}
        </div>
      )}

      <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={mutation.isPending}
          onClick={() => run("fast")}
        >
          {mutation.isPending ? "Computing…" : gate ? "Re-run gate" : "Run gate"}
        </button>
        <button
          type="button"
          className="btn"
          disabled={mutation.isPending || fullRunning}
          onClick={() => run("full")}
        >
          Run full gate
        </button>
        {fullRunning && gate?.mode !== "full" && (
          <span className="stat-label">
            computing per-window tests… (refresh lands automatically)
          </span>
        )}
      </div>

      {gate && (
        <div style={{ marginTop: "var(--sp-4)" }}>
          <ClaudeReadCard
            scope="study"
            scopeId={study.id}
            draftBaseConfig={study.config_name ?? undefined}
            currentFingerprints={{ gate_computed_at: gate.computed_at }}
            metricValues={flattenMetrics({ pooled_gate: gate })}
          />
        </div>
      )}
    </section>
  );
}
