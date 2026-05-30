import { useState } from "react";
import { Play, Trash2, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runBacktest, deleteRun, deleteAllRuns } from "@/api/client";
import { fireToast } from "@/lib/toast-controller";

type Busy = null | "run" | "delete" | "delete_all";

export function RunActions({
  currentRunId,
  onNewRun,
  onCleared,
}: {
  currentRunId: string | null;
  onNewRun: (newRunId: string) => void;
  onCleared: () => void;
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setBusy("run");
    setError(null);
    fireToast("New backtest queued…");
    try {
      const { run_id } = await runBacktest();
      onNewRun(run_id);
    } catch (e) {
      setError(`Backtest failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteCurrent = async () => {
    if (!currentRunId) return;
    if (!window.confirm(`Delete run ${currentRunId}?`)) return;
    setBusy("delete");
    setError(null);
    try {
      await deleteRun(currentRunId);
      onCleared();
    } catch (e) {
      setError(`Delete failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm("Delete ALL backtest runs? This cannot be undone."))
      return;
    setBusy("delete_all");
    setError(null);
    try {
      await deleteAllRuns();
      onCleared();
    } catch (e) {
      setError(`Delete all failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        onClick={handleRun}
        disabled={busy !== null}
        aria-label="New backtest"
      >
        <Play className="h-4 w-4 mr-1" />
        {busy === "run" ? "Running…" : "New backtest"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={handleDeleteCurrent}
        disabled={busy !== null || !currentRunId}
        aria-label="Delete this run"
      >
        <Trash2 className="h-4 w-4 mr-1" />
        {busy === "delete" ? "Deleting…" : "Delete this run"}
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={handleDeleteAll}
        disabled={busy !== null}
        aria-label="Delete all runs"
      >
        <Trash className="h-4 w-4 mr-1" />
        {busy === "delete_all" ? "Deleting…" : "Delete all runs"}
      </Button>
      {error && (
        <span className="text-xs text-red-600 dark:text-red-400 ml-2">
          {error}
        </span>
      )}
    </div>
  );
}
