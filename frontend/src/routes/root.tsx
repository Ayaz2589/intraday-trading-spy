import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import { fetchRuns } from "@/api/client";
import type { RunSummaryView } from "@/api/types";

export function Root() {
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
      <div className="p-8">
        <h1 className="text-xl font-semibold mb-2">No backtest runs yet</h1>
        <p className="mb-4 text-gray-600">
          Run a backtest to populate this viewer.
        </p>
        <pre className="bg-gray-100 p-3 rounded inline-block">make backtest</pre>
      </div>
    );
  }
  return <Navigate to={`/runs/${runs[0].run_id}`} replace />;
}
