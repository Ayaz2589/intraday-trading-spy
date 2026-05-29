import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { humanize } from "@/lib/format";
import type { RunManifestView } from "@/api/types";

type Risk = {
  account_value?: number;
  max_risk_per_trade_pct?: number;
  max_position_value_pct?: number;
  max_consecutive_losses?: number;
};

type VwapPullback = {
  max_distance_from_vwap_pct?: number;
  stop?: { buffer_pct?: number };
  target?: { risk_reward?: number };
};

type Strategy = {
  enabled_setup?: string;
  opening_range?: { minutes?: number };
  vwap_pullback?: VwapPullback;
};

const fmtMoney = (v: number | undefined) =>
  v == null ? "—" : `$${v.toLocaleString()}`;
const fmtPct = (v: number | undefined) => (v == null ? "—" : `${v}%`);
const fmtMin = (v: number | undefined) => (v == null ? "—" : `${v} min`);
const fmt = (v: number | string | undefined) => {
  if (v == null) return "—";
  return typeof v === "number" ? v.toFixed(1) : v;
};

export function StrategyConfigCard({
  manifest,
}: {
  manifest: RunManifestView;
}) {
  const cfg = manifest.config_snapshot ?? {};
  const risk = (cfg as { risk?: Risk }).risk ?? {};
  const strategy = (cfg as { strategy?: Strategy }).strategy ?? {};
  const vwap = strategy.vwap_pullback ?? {};

  return (
    <Card>
      <CardHeader>
        <CardTitle>Strategy & Risk Config</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-x-6 gap-y-3 text-sm">
        <Field
          label="Setup"
          value={
            strategy.enabled_setup ? humanize(strategy.enabled_setup) : "—"
          }
        />
        <Field label="Account" value={fmtMoney(risk.account_value)} />
        <Field
          label="Risk / Trade"
          value={fmtPct(risk.max_risk_per_trade_pct)}
        />
        <Field
          label="Position Cap"
          value={fmtPct(risk.max_position_value_pct)}
        />
        <Field
          label="Max Consecutive Losses"
          value={risk.max_consecutive_losses ?? "—"}
        />
        <Field
          label="Opening Range"
          value={fmtMin(strategy.opening_range?.minutes)}
        />
        <Field label="Risk:Reward" value={fmt(vwap.target?.risk_reward)} />
        <Field label="Stop Buffer" value={fmtPct(vwap.stop?.buffer_pct)} />
        <Field
          label="Max Distance from VWAP"
          value={fmtPct(vwap.max_distance_from_vwap_pct)}
        />
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-gray-500 dark:text-slate-400">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
