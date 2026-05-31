import { useState } from "react";
import { Trash2, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteRun, deleteAllRuns } from "@/api/legacy-client";
import { ConfirmDialog } from "./confirm-dialog";
import { runIdHash } from "@/lib/format";

type Busy = null | "delete" | "delete_all";
type Pending = null | "delete-current" | "delete-all";

export function RunActions({
  currentRunId,
  onCleared,
}: {
  currentRunId: string | null;
  onCleared: () => void;
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);

  const performDeleteCurrent = async () => {
    if (!currentRunId) return;
    setPending(null);
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

  const performDeleteAll = async () => {
    setPending(null);
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
        variant="outline"
        onClick={() => currentRunId && setPending("delete-current")}
        disabled={busy !== null || !currentRunId}
        aria-label="Delete this run"
      >
        <Trash2 className="h-4 w-4 mr-1" />
        {busy === "delete" ? "Deleting…" : "Delete this run"}
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => setPending("delete-all")}
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
      <ConfirmDialog
        open={pending === "delete-current"}
        title="Delete this run"
        message={
          currentRunId
            ? `Run ${runIdHash(currentRunId)} will be permanently removed. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={performDeleteCurrent}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending === "delete-all"}
        title="Delete all runs"
        message="Every backtest run will be permanently removed. This cannot be undone."
        confirmLabel="Delete all"
        variant="destructive"
        onConfirm={performDeleteAll}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
