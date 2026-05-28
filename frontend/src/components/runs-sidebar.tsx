import { Link } from "react-router";
import type { RunSummaryView } from "@/api/types";
import { cn } from "@/lib/utils";

export function RunsSidebar({
  runs,
  selectedRunId,
}: {
  runs: RunSummaryView[];
  selectedRunId: string | null;
}) {
  if (runs.length === 0) {
    return (
      <aside className="w-64 border-r p-4 shrink-0">
        <h2 className="font-semibold mb-2">No runs yet</h2>
        <p className="text-sm text-gray-500 mb-2">
          Run a backtest to populate this viewer.
        </p>
        <pre className="bg-gray-100 p-2 rounded text-xs">make backtest</pre>
      </aside>
    );
  }
  return (
    <aside className="w-64 border-r overflow-y-auto shrink-0">
      <h2 className="font-semibold p-4 border-b">Runs ({runs.length})</h2>
      <ul>
        {runs.map((r) => (
          <li
            key={r.run_id}
            data-selected={r.run_id === selectedRunId}
            className={cn(
              "border-b",
              r.run_id === selectedRunId && "bg-blue-50",
            )}
          >
            <Link
              to={`/runs/${r.run_id}`}
              className="block p-3 hover:bg-gray-50"
            >
              <div className="font-mono text-xs">{r.run_id}</div>
              <div className="text-xs text-gray-500">
                {new Date(r.started_at).toLocaleString()}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
