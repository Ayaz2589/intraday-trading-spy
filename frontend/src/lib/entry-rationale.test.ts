import { describe, it, expect } from "vitest";
import { entryRationale } from "./entry-rationale";
import type { BarView, JournalRowView } from "@/api/legacy-types";

const baseRow: JournalRowView = {
  row_seq: 0,
  timestamp: "2026-01-01T10:00:00-05:00",
  status: "executed",
  setup: "vwap_pullback_long",
  direction: "long",
  planned_entry: 525.6,
  stop_loss: 524.5,
  take_profit: 527.4,
  quantity: 22,
  planned_risk_dollars: 25.2,
  actual_entry: 525.6,
  actual_exit: null,
  exit_reason: null,
  realized_pnl: null,
  realized_r: null,
  vwap: 525.4,
  or_high: null,
  or_low: null,
  distance_from_vwap_pct: 0.04,
  prior_bar_close: 525.35,
  reason: "",
  rejection_check: null,
  same_bar_tiebreak: null,
};

const priorBar: BarView = {
  symbol: "SPY",
  timestamp: "2026-01-01T09:55:00-05:00",
  open: 525.0,
  high: 525.5,
  low: 525.0,
  close: 525.35,
  volume: 1000,
};

describe("entryRationale", () => {
  it("computes the close-above-prior-bar-high trigger", () => {
    const r = entryRationale(baseRow, priorBar, 25000, 100);
    const t = r.triggers.find((x) => x.key === "above_prior_high");
    expect(t).toBeDefined();
    expect(t!.leftValue).toBeCloseTo(525.6);
    expect(t!.rightValue).toBeCloseTo(525.5);
    expect(t!.delta).toBeCloseTo(0.1, 5);
    expect(t!.passed).toBe(true);
  });

  it("computes the close-above-VWAP trigger", () => {
    const r = entryRationale(baseRow, priorBar, 25000, 100);
    const t = r.triggers.find((x) => x.key === "above_vwap");
    expect(t).toBeDefined();
    expect(t!.leftValue).toBeCloseTo(525.6);
    expect(t!.rightValue).toBeCloseTo(525.4);
    expect(t!.delta).toBeCloseTo(0.2, 5);
    expect(t!.deltaPct).toBeCloseTo((0.2 / 525.4) * 100, 4);
    expect(t!.passed).toBe(true);
  });

  it("computes the pullback-within-threshold trigger from distance_from_vwap_pct", () => {
    const r = entryRationale(baseRow, priorBar, 25000, 100);
    const t = r.triggers.find((x) => x.key === "pullback_threshold");
    expect(t).toBeDefined();
    expect(t!.leftValue).toBeCloseTo(0.04);
    expect(t!.passed).toBe(true);
  });

  it("computes risk/reward per share and R:R ratio", () => {
    const r = entryRationale(baseRow, priorBar, 25000, 100);
    expect(r.plan.entry).toBeCloseTo(525.6);
    expect(r.plan.stop).toBeCloseTo(524.5);
    expect(r.plan.target).toBeCloseTo(527.4);
    expect(r.plan.riskPerShare).toBeCloseTo(1.1, 5);
    expect(r.plan.rewardPerShare).toBeCloseTo(1.8, 5);
    expect(r.plan.rrRatio).toBeCloseTo(1.8 / 1.1, 4);
  });

  it("computes position-value and pct-of-cap from account + cap", () => {
    const r = entryRationale(baseRow, priorBar, 25000, 100);
    expect(r.plan.qty).toBe(22);
    expect(r.plan.positionValue).toBeCloseTo(22 * 525.6, 2);
    // cap = 100% of 25k = 25k. position = 22 * 525.6 = 11,563.2.
    expect(r.plan.positionPctOfCap).toBeCloseTo((22 * 525.6) / 25000, 4);
  });

  it("computes risk pct of account", () => {
    const r = entryRationale(baseRow, priorBar, 25000, 100);
    expect(r.plan.riskDollars).toBeCloseTo(25.2);
    expect(r.plan.riskPctOfAccount).toBeCloseTo(25.2 / 25000, 6);
  });

  it("falls back to planned_entry when actual_entry is null", () => {
    const r = entryRationale(
      { ...baseRow, actual_entry: null, planned_entry: 525.7 },
      priorBar,
      25000,
      100,
    );
    expect(r.plan.entry).toBeCloseTo(525.7);
  });

  it("returns triggers as null when prior bar / vwap data is missing", () => {
    const r = entryRationale(
      { ...baseRow, vwap: null, distance_from_vwap_pct: null },
      null,
      25000,
      100,
    );
    expect(r.triggers.find((t) => t.key === "above_prior_high")).toBeUndefined();
    expect(r.triggers.find((t) => t.key === "above_vwap")).toBeUndefined();
    expect(r.triggers.find((t) => t.key === "pullback_threshold")).toBeUndefined();
  });
});
