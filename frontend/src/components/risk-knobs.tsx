import { useEffect, useState } from "react";
import { Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { fetchConfig, runBacktest, type ConfigOverrides } from "@/api/client";

type Form = {
  account_value: number;
  max_risk_per_trade_pct: number;
  max_position_value_pct: number;
  max_consecutive_losses: number;
  opening_range_minutes: number;
  risk_reward: number;
};

function extractForm(cfg: Record<string, unknown>): Form | null {
  const risk = cfg.risk as Record<string, number> | undefined;
  const strategy = cfg.strategy as
    | { opening_range?: { minutes?: number }; vwap_pullback?: { target?: { risk_reward?: number } } }
    | undefined;
  if (!risk || !strategy) return null;
  return {
    account_value: risk.account_value,
    max_risk_per_trade_pct: risk.max_risk_per_trade_pct,
    max_position_value_pct: risk.max_position_value_pct,
    max_consecutive_losses: risk.max_consecutive_losses,
    opening_range_minutes: strategy.opening_range?.minutes ?? 15,
    risk_reward: strategy.vwap_pullback?.target?.risk_reward ?? 2.0,
  };
}

function buildOverrides(form: Form): ConfigOverrides {
  return {
    risk: {
      account_value: form.account_value,
      max_risk_per_trade_pct: form.max_risk_per_trade_pct,
      max_position_value_pct: form.max_position_value_pct,
      max_consecutive_losses: form.max_consecutive_losses,
    },
    strategy: {
      opening_range: { minutes: form.opening_range_minutes },
      vwap_pullback: { target: { risk_reward: form.risk_reward } },
    },
  };
}

export function RiskKnobs({
  onNewRun,
}: {
  onNewRun: (newRunId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetchConfig()
      .then((cfg) => setForm(extractForm(cfg)))
      .catch((e: Error) => setError(e.message));
  }, [open]);

  const update = (k: keyof Form, v: number) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const handleRun = async () => {
    if (!form) return;
    setBusy(true);
    setError(null);
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
      <PopoverContent className="w-96">
        <h4 className="font-semibold mb-3">Risk + strategy knobs</h4>
        {form == null ? (
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Loading config…
          </p>
        ) : (
          <div className="space-y-3 text-sm">
            <NumberField
              label="Account value ($)"
              value={form.account_value}
              step={1000}
              onChange={(v) => update("account_value", v)}
            />
            <NumberField
              label="Risk per trade (%)"
              value={form.max_risk_per_trade_pct}
              step={0.05}
              onChange={(v) => update("max_risk_per_trade_pct", v)}
            />
            <NumberField
              label="Position cap (%)"
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
              label="Opening range (min)"
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
            <Button
              size="sm"
              className="w-full mt-2"
              disabled={busy}
              onClick={handleRun}
            >
              {busy ? "Running…" : "Run with these settings"}
            </Button>
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function NumberField({
  label,
  value,
  step,
  integer = false,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  integer?: boolean;
  onChange: (v: number) => void;
}) {
  const id = label.replace(/\s+/g, "-").toLowerCase();
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-gray-700 dark:text-slate-300 flex-1">
        {label}
      </label>
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
        className="w-28 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 font-mono text-right"
      />
    </div>
  );
}
