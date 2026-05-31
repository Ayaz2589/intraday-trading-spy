import { useEffect, useMemo, useState } from "react";
import { Play, Sliders, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  fetchConfig,
  fetchConfigs,
  fetchDatasets,
  runBacktest,
  runBacktestWithConfig,
  type ConfigOverrides,
  type ConfigSummary,
  type DatasetSummary,
} from "@/api/legacy-client";
import { fireToast } from "@/lib/toast-controller";

// Single consolidated launcher for new backtests: pick a saved preset
// or hand-tune knobs in the Custom tab. Strategy selector lives in the
// header — today there is one option (VWAP Pullback Long); future
// strategies will plug in here once the backend strategy factory lands.
type Tab = "presets" | "custom";
type StrategyId = "vwap_pullback_long";

const STRATEGIES: { id: StrategyId; label: string; enabled: boolean }[] = [
  { id: "vwap_pullback_long", label: "VWAP Pullback Long", enabled: true },
];

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

export function ConfigureRunMenu({
  onNewRun,
}: {
  onNewRun: (newRunId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("presets");
  const [strategy, setStrategy] = useState<StrategyId>("vwap_pullback_long");

  const [configs, setConfigs] = useState<ConfigSummary[] | null>(null);
  const [busyPreset, setBusyPreset] = useState<string | null>(null);

  const [form, setForm] = useState<Form | null>(null);
  const [original, setOriginal] = useState<Form | null>(null);
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [busyCustom, setBusyCustom] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || configs) return;
    fetchConfigs()
      .then(setConfigs)
      .catch((e: Error) => setError(e.message));
  }, [open, configs]);

  useEffect(() => {
    if (!open || tab !== "custom" || form) return;
    Promise.all([fetchConfig(), fetchDatasets()])
      .then(([cfg, ds]) => {
        const extracted = extractForm(cfg);
        setForm(extracted);
        setOriginal(extracted);
        setDatasets(ds);
      })
      .catch((e: Error) => setError(e.message));
  }, [open, tab, form]);

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

  const handlePickPreset = async (cfg: ConfigSummary) => {
    setBusyPreset(cfg.name);
    setError(null);
    fireToast(`Running preset "${cfg.name}"…`);
    try {
      const { run_id } = await runBacktestWithConfig(cfg.path);
      setOpen(false);
      onNewRun(run_id);
    } catch (e) {
      setError(`${cfg.name}: ${(e as Error).message}`);
    } finally {
      setBusyPreset(null);
    }
  };

  const handleRunCustom = async () => {
    if (!form) return;
    setBusyCustom(true);
    setError(null);
    fireToast("Running with custom settings…");
    try {
      const { run_id } = await runBacktest(buildOverrides(form));
      setOpen(false);
      onNewRun(run_id);
    } catch (e) {
      setError(`Backtest failed: ${(e as Error).message}`);
    } finally {
      setBusyCustom(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" aria-label="Run backtest">
          <Play className="h-4 w-4 mr-1" />
          Run backtest
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="popover configure-run-pop"
        style={{ padding: 0, width: 420 }}
      >
        <div className="pop-head">
          <span className="pop-title">Run a new backtest</span>
        </div>

        <div className="cfg-row">
          <label htmlFor="strategy-select" className="cfg-row-label">
            Strategy
            <Sliders className="h-3.5 w-3.5" aria-hidden style={{ opacity: 0.6 }} />
          </label>
          <div className="knob-select cfg-row-control">
            <select
              id="strategy-select"
              aria-label="Strategy"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as StrategyId)}
            >
              {STRATEGIES.map((s) => (
                <option key={s.id} value={s.id} disabled={!s.enabled}>
                  {s.label}
                </option>
              ))}
            </select>
            <span className="sel-caret">▾</span>
          </div>
        </div>

        <div className="seg cfg-tabs" role="tablist" aria-label="Run configuration">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "presets"}
            className={tab === "presets" ? "seg-on" : ""}
            onClick={() => setTab("presets")}
          >
            Presets
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "custom"}
            className={tab === "custom" ? "seg-on" : ""}
            onClick={() => setTab("custom")}
          >
            Custom
          </button>
        </div>

        {tab === "presets" && (
          <PresetsPanel
            configs={configs}
            busyName={busyPreset}
            onPick={handlePickPreset}
          />
        )}
        {tab === "custom" && (
          <CustomPanel
            form={form}
            datasets={datasets}
            busy={busyCustom}
            isDirty={isDirty}
            onUpdate={update}
            onRevert={handleRevert}
            onRun={handleRunCustom}
          />
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

function PresetsPanel({
  configs,
  busyName,
  onPick,
}: {
  configs: ConfigSummary[] | null;
  busyName: string | null;
  onPick: (cfg: ConfigSummary) => void;
}) {
  if (configs == null) {
    return (
      <p
        style={{
          fontSize: "var(--fs-sm)",
          color: "var(--text-muted)",
          padding: "var(--sp-3) var(--sp-5)",
        }}
      >
        Loading…
      </p>
    );
  }
  if (configs.length === 0) {
    return (
      <p
        style={{
          fontSize: "var(--fs-sm)",
          color: "var(--text-muted)",
          padding: "var(--sp-3) var(--sp-5)",
        }}
      >
        No configs found.
      </p>
    );
  }
  return (
    <div className="preset-list">
      {configs.map((cfg) => (
        <button
          key={cfg.path}
          type="button"
          className="preset-item"
          onClick={() => onPick(cfg)}
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
  );
}

function CustomPanel({
  form,
  datasets,
  busy,
  isDirty,
  onUpdate,
  onRevert,
  onRun,
}: {
  form: Form | null;
  datasets: DatasetSummary[];
  busy: boolean;
  isDirty: boolean;
  onUpdate: <K extends keyof Form>(k: K, v: Form[K]) => void;
  onRevert: () => void;
  onRun: () => void;
}) {
  if (form == null) {
    return (
      <p
        style={{
          fontSize: "var(--fs-sm)",
          color: "var(--text-muted)",
          padding: "var(--sp-4) var(--sp-5)",
        }}
      >
        Loading config…
      </p>
    );
  }
  return (
    <>
      <div className="knob-grid">
        <DatasetField
          label="Data window"
          value={form.csv_path}
          datasets={datasets}
          onChange={(v) => onUpdate("csv_path", v)}
        />
        <NumberField
          label="Account value"
          suffix="$"
          value={form.account_value}
          step={1000}
          onChange={(v) => onUpdate("account_value", v)}
        />
        <NumberField
          label="Risk per trade"
          suffix="%"
          value={form.max_risk_per_trade_pct}
          step={0.05}
          onChange={(v) => onUpdate("max_risk_per_trade_pct", v)}
        />
        <NumberField
          label="Position cap"
          suffix="%"
          value={form.max_position_value_pct}
          step={5}
          onChange={(v) => onUpdate("max_position_value_pct", v)}
        />
        <NumberField
          label="Max consecutive losses"
          value={form.max_consecutive_losses}
          step={1}
          integer
          onChange={(v) => onUpdate("max_consecutive_losses", v)}
        />
        <NumberField
          label="Opening range"
          suffix="min"
          value={form.opening_range_minutes}
          step={5}
          integer
          onChange={(v) => onUpdate("opening_range_minutes", v)}
        />
        <NumberField
          label="Risk:Reward"
          value={form.risk_reward}
          step={0.5}
          onChange={(v) => onUpdate("risk_reward", v)}
        />
        <NumberField
          label="Max distance from VWAP"
          suffix="%"
          value={form.max_distance_from_vwap_pct}
          step={0.05}
          onChange={(v) => onUpdate("max_distance_from_vwap_pct", v)}
        />
      </div>
      <div className="knob-foot">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onRevert}
          disabled={!isDirty || busy}
          aria-label="Revert"
        >
          <Undo2 className="h-4 w-4 mr-1" /> Revert
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={onRun}
        >
          {busy ? "Running…" : "Run with these settings"}
        </button>
      </div>
    </>
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
  const inList = datasets.some((d) => d.path === value);
  return (
    <label className="knob" htmlFor={id}>
      <span className="knob-label">{label}</span>
      <div className="knob-select">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
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
