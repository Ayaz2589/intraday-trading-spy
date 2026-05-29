import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { fetchRuns } from "@/api/client";
import { RunActions } from "@/components/run-actions";
import { RiskKnobs } from "@/components/risk-knobs";
import { ThemeToggle } from "@/components/theme-toggle";
import type { RunSummaryView } from "@/api/types";

export function Root() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunSummaryView[] | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetchRuns({ signal: ctrl.signal })
      .then(setRuns)
      .catch(() => setRuns([]));
    return () => ctrl.abort();
  }, []);

  if (runs == null) return <div className="p-8">Loading…</div>;
  if (runs.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between p-2 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <RunActions
              currentRunId={null}
              onNewRun={(id) => navigate(`/runs/${id}`)}
              onCleared={() => setRuns([])}
            />
            <RiskKnobs onNewRun={(id) => navigate(`/runs/${id}`)} />
          </div>
          <ThemeToggle />
        </div>
        <div className="p-8">
          <h1 className="text-xl font-semibold mb-2">No backtest runs yet</h1>
          <p className="mb-4 text-gray-600 dark:text-slate-400">
            Click <span className="font-semibold">New backtest</span> above, or
            run from the CLI:
          </p>
          <pre className="bg-gray-100 dark:bg-slate-800 p-3 rounded inline-block">
            make backtest
          </pre>
        </div>
      </div>
    );
  }
  return <Navigate to={`/runs/${runs[0].run_id}`} replace />;
}
