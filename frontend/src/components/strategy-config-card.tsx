import { humanize } from "@/lib/format";
import type { RunManifestView } from "@/api/legacy-types";

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

// StrategyConfigCard — restyled per design handoff's .card + .config-grid.
// Spec FR-016: accent rail in --accent (brand blue) for Config card.
export function StrategyConfigCard({ manifest }: { manifest: RunManifestView }) {
  const cfg = manifest.config_snapshot ?? {};
  const risk = (cfg as { risk?: Risk }).risk ?? {};
  const strategy = (cfg as { strategy?: Strategy }).strategy ?? {};
  const vwap = strategy.vwap_pullback ?? {};

  const items: Array<{ label: string; value: string | number; wide?: boolean; mono?: boolean }> = [
    {
      label: "Setup",
      value: strategy.enabled_setup ? humanize(strategy.enabled_setup) : "—",
      wide: true,
      mono: false,
    },
    { label: "Account", value: fmtMoney(risk.account_value) },
    { label: "Risk / Trade", value: fmtPct(risk.max_risk_per_trade_pct) },
    { label: "Position Cap", value: fmtPct(risk.max_position_value_pct) },
    {
      label: "Max Consec. Losses",
      value: risk.max_consecutive_losses ?? "—",
    },
    { label: "Opening Range", value: fmtMin(strategy.opening_range?.minutes) },
    { label: "Risk : Reward", value: fmt(vwap.target?.risk_reward) },
    { label: "Stop Buffer", value: fmtPct(vwap.stop?.buffer_pct) },
    { label: "Max Dist. from VWAP", value: fmtPct(vwap.max_distance_from_vwap_pct) },
  ];

  return (
    <section className="card">
      <header className="card-head">
        <h3 className="card-title">
          <span className="card-accent" style={{ background: "var(--accent)" }} />
          Strategy &amp; Risk Config
        </h3>
        <span className="chip chip-accent">VWAP Pullback</span>
      </header>
      <div className="config-grid">
        {items.map((it) => (
          <div
            key={it.label}
            className={`config-item${it.wide ? " span-2" : ""}`}
          >
            <div className="stat-label">{it.label}</div>
            <div className={`config-val${it.mono === false ? "" : " mono"}`}>
              {it.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
