import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  fetchConfigs,
  runBacktestWithConfig,
  type ConfigSummary,
} from "@/api/client";
import { fireToast } from "@/lib/toast-controller";

export function PresetPicker({
  onNewRun,
}: {
  onNewRun: (newRunId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [configs, setConfigs] = useState<ConfigSummary[] | null>(null);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || configs) return;
    fetchConfigs()
      .then(setConfigs)
      .catch((e: Error) => setError(e.message));
  }, [open, configs]);

  const handlePick = async (cfg: ConfigSummary) => {
    setBusyName(cfg.name);
    setError(null);
    fireToast(`Running preset "${cfg.name}"…`);
    try {
      const { run_id } = await runBacktestWithConfig(cfg.path);
      setOpen(false);
      onNewRun(run_id);
    } catch (e) {
      setError(`${cfg.name}: ${(e as Error).message}`);
    } finally {
      setBusyName(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" aria-label="Presets">
          <FolderOpen className="h-4 w-4 mr-1" />
          Presets
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <h4 className="font-semibold mb-2">Run a preset config</h4>
        {configs == null ? (
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Loading…
          </p>
        ) : configs.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-slate-400">
            No configs found.
          </p>
        ) : (
          <ul className="space-y-1">
            {configs.map((cfg) => (
              <li key={cfg.path}>
                <button
                  type="button"
                  onClick={() => handlePick(cfg)}
                  disabled={busyName !== null}
                  className="w-full text-left rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  <div className="font-mono text-sm">{cfg.name}</div>
                  <div className="text-xs text-gray-500 dark:text-slate-400">
                    {busyName === cfg.name ? "Running…" : cfg.path}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
