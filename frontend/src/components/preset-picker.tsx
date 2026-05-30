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
      <PopoverContent
        className="popover preset-pop"
        style={{ padding: 0, width: 340 }}
      >
        <div className="pop-head">
          <span className="pop-title">Run a preset config</span>
          {configs && (
            <span className="pop-sub">
              {configs.length === 1
                ? "1 saved config"
                : `${configs.length} saved configs`}
            </span>
          )}
        </div>
        {configs == null ? (
          <p
            style={{
              fontSize: "var(--fs-sm)",
              color: "var(--text-muted)",
              padding: "var(--sp-3) var(--sp-5)",
            }}
          >
            Loading…
          </p>
        ) : configs.length === 0 ? (
          <p
            style={{
              fontSize: "var(--fs-sm)",
              color: "var(--text-muted)",
              padding: "var(--sp-3) var(--sp-5)",
            }}
          >
            No configs found.
          </p>
        ) : (
          <div className="preset-list">
            {configs.map((cfg) => (
              <button
                key={cfg.path}
                type="button"
                className="preset-item"
                onClick={() => handlePick(cfg)}
                disabled={busyName !== null}
                style={busyName !== null ? { opacity: 0.5 } : undefined}
              >
                <span className="preset-icon mono">
                  {cfg.name === "default" ? "★" : "›"}
                </span>
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <span className="preset-name mono">{cfg.name}</span>
                  <span className="preset-desc">
                    {busyName === cfg.name ? "Running…" : "Preset configuration"}
                  </span>
                </span>
                <span className="preset-path mono">{cfg.path}</span>
              </button>
            ))}
          </div>
        )}
        {error && (
          <p
            style={{
              fontSize: "var(--fs-xs)",
              color: "var(--loss)",
              padding: "0 var(--sp-5) var(--sp-3)",
            }}
          >
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
