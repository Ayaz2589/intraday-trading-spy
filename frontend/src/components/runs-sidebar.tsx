import { Link } from "react-router";
import type { RunSummaryView } from "@/api/legacy-types";
import { formatRunTitle, runIdHash } from "@/lib/format";

// RunsSidebar — restyled per the design handoff's .sidebar block.
// Spec ref: specs/004-design-system-adoption/spec.md FR-009, FR-015, FR-020.
export function RunsSidebar({
  runs,
  selectedRunId,
}: {
  runs: RunSummaryView[];
  selectedRunId: string | null;
}) {
  if (runs.length === 0) {
    return (
      <>
        <div className="side-head">
          <span className="side-title">Runs</span>
          <span className="count-pill">0</span>
        </div>
        <div style={{ padding: "0 var(--sp-2)" }}>
          <h2
            style={{
              fontSize: "var(--fs-md)",
              fontWeight: 700,
              margin: 0,
              marginBottom: "var(--sp-2)",
            }}
          >
            No runs yet
          </h2>
          <p
            style={{
              fontSize: "var(--fs-sm)",
              color: "var(--text-muted)",
              margin: 0,
              marginBottom: "var(--sp-3)",
            }}
          >
            Run a backtest to populate this viewer.
          </p>
          <pre
            className="mono"
            style={{
              background: "var(--surface-2)",
              color: "var(--text)",
              padding: "8px 12px",
              borderRadius: "var(--r-md)",
              fontSize: "var(--fs-xs)",
              margin: 0,
              display: "inline-block",
            }}
          >
            make backtest
          </pre>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <div className="side-head">
        <span className="side-title">Runs</span>
        <span className="count-pill">{runs.length}</span>
      </div>
      <div className="run-list" role="list">
        {runs.map((r) => {
          const isActive = r.run_id === selectedRunId;
          const totalR = r.summary?.total_r ?? 0;
          const totalTrades = r.summary?.total_trades ?? 0;
          const positive = totalR >= 0;
          return (
            <Link
              key={r.run_id}
              to={`/runs/${r.run_id}`}
              role="listitem"
              data-selected={isActive ? "true" : "false"}
              aria-current={isActive ? "page" : undefined}
              className={isActive ? "run-item run-on" : "run-item"}
              style={{ textDecoration: "none" }}
            >
              <span className="run-id">{formatRunTitle(r.started_at)}</span>
              <span className="run-time mono">{runIdHash(r.run_id)}</span>
              <span className="run-meta">
                <span
                  className={`badge badge-xs ${
                    positive ? "badge-profit" : "badge-loss"
                  } mono`}
                >
                  {positive ? "+" : ""}
                  {totalR.toFixed(2)}R
                </span>
                <span className="run-trades mono">{totalTrades}t</span>
              </span>
            </Link>
          );
        })}
      </div>
      <Footer />
    </>
  );
}

function Footer() {
  return (
    <div className="side-foot">
      <div className="legend-mini">
        <span>
          <i className="dot" style={{ background: "var(--warn)" }} />
          VWAP
        </span>
        <span>
          <i className="dot" style={{ background: "var(--profit)" }} />
          OR hi/lo
        </span>
      </div>
    </div>
  );
}
