import { useSignificance } from "@/hooks/useStudies";
import { SignificancePanel } from "./significance-panel";
import type { UUID } from "@/api/types";

// Feature 011 (US3): significance for a *persisted* backtest run — bootstrap
// CIs + the random-entry permutation verdict. Lives on the run-detail page
// because a study's per-window evaluations aren't saved as standalone runs
// (FR-005 deferred); a normal backtest run is.
export function RunSignificanceSection({ runId }: { runId: UUID }) {
  const sig = useSignificance();

  return (
    <section className="card" data-testid="run-significance">
      <header className="card-head">
        <h3 className="card-title">
          <span className="card-accent" style={{ background: "var(--info)" }} />
          Significance
        </h3>
      </header>

      {!sig.data && (
        <>
          <p className="stat-label">
            Is this result distinguishable from luck? Computes a bootstrap confidence
            interval on expectancy/Sharpe and a random-entry permutation test.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={sig.isPending}
            onClick={() => sig.mutate(runId)}
          >
            {sig.isPending ? "Computing… (bootstrap + permutation)" : "Compute significance"}
          </button>
        </>
      )}

      {sig.isError && (
        <div style={{ color: "var(--loss)" }}>{(sig.error as Error)?.message ?? "Failed"}</div>
      )}

      {sig.data && <SignificancePanel result={sig.data} />}
    </section>
  );
}
