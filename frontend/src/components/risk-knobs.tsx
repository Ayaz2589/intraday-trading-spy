import { useEffect, useMemo, useState } from "react";
import { Sliders, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fireToast } from "@/lib/toast-controller";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  fetchConfig,
  fetchDatasets,
  runBacktest,
  type ConfigOverrides,
  type DatasetSummary,
} from "@/api/client";

type Form = {
  csv_path: string;
  account_value: number;
  max_risk_per_trade_pct: number;
  max_position_value_pct: number;
  max_consecutive_losses: number;
  opening_range_minutes: number;
  risk_reward: number;
  max_distance_from_vwap_pct: number;
};

function extractForm(cfg: Record<string, unknown>): Form | null {
  const risk = cfg.risk as Record<string, number> | undefined;
  const strategy = cfg.strategy as
    | {
        opening_range?: { minutes?: number };
        vwap_pullback?: {
          max_distance_from_vwap_pct?: number;
          target?: { risk_reward?: number };
        };
      }
    | undefined;
  const data = cfg.data as { csv_path?: string } | undefined;
  if (!risk || !strategy) return null;
  return {
    csv_path: data?.csv_path ?? "",
    account_value: risk.account_value,
    max_risk_per_trade_pct: risk.max_risk_per_trade_pct,
    max_position_value_pct: risk.max_position_value_pct,
    max_consecutive_losses: risk.max_consecutive_losses,
    opening_range_minutes: strategy.opening_range?.minutes ?? 15,
    risk_reward: strategy.vwap_pullback?.target?.risk_reward ?? 2.0,
    max_distance_from_vwap_pct:
      strategy.vwap_pullback?.max_distance_from_vwap_pct ?? 0.25,
  };
}

function buildOverrides(form: Form): ConfigOverrides {
  return {
    data: { csv_path: form.csv_path },
    risk: {
      account_value: form.account_value,
      max_risk_per_trade_pct: form.max_risk_per_trade_pct,
      max_position_value_pct: form.max_position_value_pct,
      max_consecutive_losses: form.max_consecutive_losses,
    },
    strategy: {
      opening_range: { minutes: form.opening_range_minutes },
      vwap_pullback: {
        max_distance_from_vwap_pct: form.max_distance_from_vwap_pct,
        target: { risk_reward: form.risk_reward },
      },
    },
  };
}

function datasetLabel(d: DatasetSummary): string {
  if (d.start && d.end) {
    const sessions = d.session_count
      ? ` · ${d.session_count} session${d.session_count === 1 ? "" : "s"}`
      : "";
    return `${d.start} → ${d.end}${sessions}`;
  }
  return d.name;
}

export function RiskKnobs({
  onNewRun,
}: {
  onNewRun: (newRunId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [original, setOriginal] = useState<Form | null>(null);
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    Promise.all([fetchConfig(), fetchDatasets()])
      .then(([cfg, ds]) => {
        const extracted = extractForm(cfg);
        setForm(extracted);
        setOriginal(extracted);
        setDatasets(ds);
      })
      .catch((e: Error) => setError(e.message));
  }, [open]);

  const update = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const isDirty = useMemo(() => {
    if (!form || !original) return false;
    return (Object.keys(form) as (keyof Form)[]).some(
      (k) => form[k] !== original[k],
    );
  }, [form, original]);

  const handleRevert = () => {
    if (original) setForm({ ...original });
  };

  const handleRun = async () => {
    if (!form) return;
    setBusy(true);
    setError(null);
    fireToast("Running with custom settings…");
    try {
      const { run_id } = await runBacktest(buildOverrides(form));
      setOpen(false);
      onNewRun(run_id);
    } catch (e) {
      setError(`Backtest failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" aria-label="Customize backtest">
          <Sliders className="h-4 w-4 mr-1" />
          Customize
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="popover knobs-pop"
        style={{ padding: 0, width: 380 }}
      >
        <div className="pop-head">
          <span className="pop-title">Risk + strategy knobs</span>
        </div>
        {form == null ? (
          <p
            style={{
              fontSize: "var(--fs-sm)",
              color: "var(--text-muted)",
              padding: "var(--sp-4) var(--sp-5)",
            }}
          >
            Loading config…
          </p>
        ) : (
          <>
            <div className="knob-grid">
              <DatasetField
                label="Data window"
                value={form.csv_path}
                datasets={datasets}
                onChange={(v) => update("csv_path", v)}
              />
              <NumberField
                label="Account value"
                suffix="$"
                value={form.account_value}
                step={1000}
                onChange={(v) => update("account_value", v)}
              />
              <NumberField
                label="Risk per trade"
                suffix="%"
                value={form.max_risk_per_trade_pct}
                step={0.05}
                onChange={(v) => update("max_risk_per_trade_pct", v)}
              />
              <NumberField
                label="Position cap"
                suffix="%"
                value={form.max_position_value_pct}
                step={5}
                onChange={(v) => update("max_position_value_pct", v)}
              />
              <NumberField
                label="Max consecutive losses"
                value={form.max_consecutive_losses}
                step={1}
                integer
                onChange={(v) => update("max_consecutive_losses", v)}
              />
              <NumberField
                label="Opening range"
                suffix="min"
                value={form.opening_range_minutes}
                step={5}
                integer
                onChange={(v) => update("opening_range_minutes", v)}
              />
              <NumberField
                label="Risk:Reward"
                value={form.risk_reward}
                step={0.5}
                onChange={(v) => update("risk_reward", v)}
              />
              <NumberField
                label="Max distance from VWAP"
                suffix="%"
                value={form.max_distance_from_vwap_pct}
                step={0.05}
                onChange={(v) => update("max_distance_from_vwap_pct", v)}
              />
            </div>
            <div className="knob-foot">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleRevert}
                disabled={!isDirty || busy}
                aria-label="Revert"
              >
                <Undo2 className="h-4 w-4 mr-1" /> Revert
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={handleRun}
              >
                {busy ? "Running…" : "Run with these settings"}
              </button>
            </div>
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
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function DatasetField({
  label,
  value,
  datasets,
  onChange,
}: {
  label: string;
  value: string;
  datasets: DatasetSummary[];
  onChange: (v: string) => void;
}) {
  const id = label.replace(/\s+/g, "-").toLowerCase();
  // If the config's csv_path isn't in the listed datasets, keep the stale
  // option so the select doesn't silently rewrite the path.
  const inList = datasets.some((d) => d.path === value);
  return (
    <label className="knob" htmlFor={id}>
      <span className="knob-label">{label}</span>
      <div className="knob-select">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {!inList && value && (
            <option value={value}>{value} (current)</option>
          )}
          {datasets.length === 0 && (
            <option value="" disabled>
              No CSVs in data/raw/
            </option>
          )}
          {datasets.map((d) => (
            <option key={d.path} value={d.path}>
              {datasetLabel(d)}
            </option>
          ))}
        </select>
        <span className="sel-caret">▾</span>
      </div>
    </label>
  );
}

function NumberField({
  label,
  value,
  step,
  integer = false,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  integer?: boolean;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  const id = label.replace(/\s+/g, "-").toLowerCase();
  return (
    <label className="knob" htmlFor={id}>
      <span className="knob-label">{label}</span>
      <div className="knob-field">
        <input
          id={id}
          type="number"
          value={value}
          step={step}
          onChange={(e) => {
            const v = integer
              ? parseInt(e.target.value, 10)
              : parseFloat(e.target.value);
            if (!Number.isNaN(v)) onChange(v);
          }}
        />
        {suffix && <span className="knob-suffix">{suffix}</span>}
      </div>
    </label>
  );
}
