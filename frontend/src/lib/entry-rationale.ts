import type { BarView, JournalRowView } from "@/api/types";

// One row of "why" data. The component renders these as a checklist.
export interface TriggerCheck {
  key: "above_prior_high" | "above_vwap" | "pullback_threshold";
  label: string;
  leftValue: number; // e.g. entry close, or distance_from_vwap_pct
  rightValue: number; // e.g. prior bar high, VWAP, threshold pct
  delta: number; // leftValue - rightValue (for ratio triggers, leftValue alone)
  deltaPct: number; // % delta where it makes sense
  passed: boolean;
}

export interface TradePlan {
  entry: number;
  stop: number;
  target: number;
  riskPerShare: number;
  rewardPerShare: number;
  rrRatio: number;
  qty: number | null;
  riskDollars: number | null;
  positionValue: number | null;
  positionPctOfCap: number | null; // 0..1
  riskPctOfAccount: number | null; // 0..1
}

export interface EntryRationale {
  triggers: TriggerCheck[];
  plan: TradePlan;
}

// Build the rationale for one executed entry row.
//   row              the journal row with status === "executed"
//   priorBar         the bar immediately before the entry bar
//   accountValue     from the run's config (risk.account_value)
//   positionCapPct   from config (risk.max_position_value_pct, e.g. 100 = 100%)
export function entryRationale(
  row: JournalRowView,
  priorBar: BarView | null,
  accountValue: number,
  positionCapPct: number,
): EntryRationale {
  const entry = row.actual_entry ?? row.planned_entry ?? 0;
  const stop = row.stop_loss ?? 0;
  const target = row.take_profit ?? entry;
  const riskPerShare = Math.max(0, entry - stop);
  const rewardPerShare = Math.max(0, target - entry);
  const rrRatio = riskPerShare > 0 ? rewardPerShare / riskPerShare : 0;
  const qty = row.quantity;
  const positionValue = qty != null ? qty * entry : null;
  const capDollars = accountValue * (positionCapPct / 100);
  const positionPctOfCap =
    positionValue != null && capDollars > 0 ? positionValue / capDollars : null;
  const riskPctOfAccount =
    row.planned_risk_dollars != null && accountValue > 0
      ? row.planned_risk_dollars / accountValue
      : null;

  const triggers: TriggerCheck[] = [];
  if (priorBar) {
    const delta = entry - priorBar.high;
    triggers.push({
      key: "above_prior_high",
      label: "Close above prior bar high",
      leftValue: entry,
      rightValue: priorBar.high,
      delta,
      deltaPct: priorBar.high > 0 ? (delta / priorBar.high) * 100 : 0,
      passed: delta > 0,
    });
  }
  if (row.vwap != null) {
    const delta = entry - row.vwap;
    triggers.push({
      key: "above_vwap",
      label: "Close above VWAP",
      leftValue: entry,
      rightValue: row.vwap,
      delta,
      deltaPct: row.vwap > 0 ? (delta / row.vwap) * 100 : 0,
      passed: delta > 0,
    });
  }
  if (row.distance_from_vwap_pct != null) {
    // The threshold itself isn't in the row — the component injects it
    // from config. We surface the distance with placeholder rightValue
    // and a flag the renderer can fill in.
    triggers.push({
      key: "pullback_threshold",
      label: "Pullback within threshold",
      leftValue: row.distance_from_vwap_pct,
      rightValue: 0,
      delta: row.distance_from_vwap_pct,
      deltaPct: 0,
      passed: true,
    });
  }

  return {
    triggers,
    plan: {
      entry,
      stop,
      target,
      riskPerShare,
      rewardPerShare,
      rrRatio,
      qty,
      riskDollars: row.planned_risk_dollars,
      positionValue,
      positionPctOfCap,
      riskPctOfAccount,
    },
  };
}
