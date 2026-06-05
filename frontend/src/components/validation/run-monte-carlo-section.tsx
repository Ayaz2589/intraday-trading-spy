import { useMonteCarlo } from "@/hooks/useStudies";
import { MonteCarloPanel } from "./monte-carlo-panel";
import { HelpTooltip } from "../help-tooltip";
import type { UUID } from "@/api/types";

// Feature 015: on-demand Monte Carlo path-risk for a persisted run. Lives on
// the run-detail page beside the significance section, so it works on every
// run surface: standalone backtests, walk-forward window children,
// sensitivity grid points, and the lockbox run (Feature 014 drill-down).
export function RunMonteCarloSection({ runId }: { runId: UUID }) {
  const mc = useMonteCarlo();

  return (
    <section className="card" data-testid="run-monte-carlo">
      <header className="card-head">
        <h3 className="card-title">
          <span className="card-accent" style={{ background: "var(--info)" }} />
          Monte Carlo risk <HelpTooltip helpKey="monte_carlo_simulation" />
        </h3>
      </header>

      {!mc.data && (
        <>
          <p className="stat-label">
            Your equity curve is ONE ordering of these trades. Reshuffle them
            thousands of times to see how bad the drawdown could plausibly have
            been with the same edge.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={mc.isPending}
            onClick={() => mc.mutate(runId)}
          >
            {mc.isPending ? "Simulating… (reshuffling your trades)" : "Run simulation"}
          </button>
        </>
      )}

      {mc.isError && (
        <div style={{ color: "var(--loss)" }}>{(mc.error as Error)?.message ?? "Failed"}</div>
      )}

      {mc.data && <MonteCarloPanel result={mc.data} />}
    </section>
  );
}
