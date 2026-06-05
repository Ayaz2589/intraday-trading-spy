import { useMonteCarlo } from "@/hooks/useStudies";
import { MonteCarloPanel } from "./monte-carlo-panel";
import { HelpTooltip } from "../help-tooltip";
import type { Run, UUID } from "@/api/types";

// Feature 015: on-demand Monte Carlo path-risk for a persisted run. Lives on
// the run-detail page beside the significance section, so it works on every
// run surface: standalone backtests, walk-forward window children,
// sensitivity grid points, and the lockbox run (Feature 014 drill-down).
export function RunMonteCarloSection({
  runId,
  segment,
}: {
  runId: UUID;
  segment?: Run["segment"];
}) {
  const mc = useMonteCarlo();
  // Clarified rule (spec Session 2026-06-04): caveat unless PROVABLY
  // out-of-sample — train children, no-segment sensitivity children, and all
  // plain backtests get the warning.
  const provablyOOS = segment === "validation" || segment === "lockbox";

  return (
    <section className="card" data-testid="run-monte-carlo">
      <header className="card-head">
        <h3 className="card-title">
          <span className="card-accent" style={{ background: "var(--info)" }} />
          Monte Carlo risk <HelpTooltip helpKey="monte_carlo_simulation" />
        </h3>
      </header>

      {!provablyOOS && (
        <div
          data-testid="mc-insample-caveat"
          className="stat-label"
          style={{
            background: "color-mix(in srgb, var(--warn, #b58a2a) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--warn, #b58a2a) 45%, transparent)",
            borderRadius: "var(--r-md)",
            padding: "var(--sp-2) var(--sp-3)",
            marginBottom: "var(--sp-3)",
          }}
        >
          ⚠ These trades are not provably out-of-sample, so risk estimates may
          be optimistic. Prefer a walk-forward OOS window or the lockbox run.{" "}
          <HelpTooltip helpKey="mc_in_sample_caveat" />
        </div>
      )}

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
