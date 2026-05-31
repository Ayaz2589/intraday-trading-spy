import { describe, it, expect } from "vitest";
import { exitRationale } from "./exit-rationale";
import type { JournalRowView } from "@/api/legacy-types";

const baseRow: JournalRowView = {
  row_seq: 0,
  timestamp: "2026-01-01T10:30:00-05:00",
  status: "exited",
  setup: "vwap_pullback_long",
  direction: "long",
  planned_entry: 525.6,
  stop_loss: 524.5,
  take_profit: 527.4,
  quantity: 22,
  planned_risk_dollars: 25.2,
  actual_entry: 525.6,
  actual_exit: 527.4,
  exit_reason: "target",
  realized_pnl: 200,
  realized_r: 1.0,
  vwap: 525.8,
  or_high: null,
  or_low: null,
  distance_from_vwap_pct: null,
  prior_bar_close: null,
  reason: "",
  rejection_check: null,
  same_bar_tiebreak: null,
};

describe("exitRationale", () => {
  it("describes a clean target hit (no slippage)", () => {
    const r = exitRationale(baseRow, "2026-01-01T10:00:00-05:00");
    expect(r.reason).toBe("target");
    expect(r.reasonLabel).toBe("Target hit");
    expect(r.exitPrice).toBeCloseTo(527.4);
    expect(r.realizedR).toBeCloseTo(1.0);
    expect(r.realizedPnl).toBeCloseTo(200);
    expect(r.entry).toBeCloseTo(525.6);
    expect(r.plannedExit).toBeCloseTo(527.4);
    expect(r.slippage).toBeCloseTo(0, 4);
  });

  it("describes a stop hit with slippage worse than planned", () => {
    const r = exitRationale(
      {
        ...baseRow,
        exit_reason: "stop",
        actual_exit: 524.4, // worse fill than planned $524.50 stop
        realized_pnl: -110,
        realized_r: -1.05,
      },
      "2026-01-01T10:00:00-05:00",
    );
    expect(r.reason).toBe("stop");
    expect(r.reasonLabel).toBe("Stop hit");
    expect(r.plannedExit).toBeCloseTo(524.5);
    expect(r.exitPrice).toBeCloseTo(524.4);
    // Long position, exit worse than planned (lower) → slippage negative.
    expect(r.slippage).toBeCloseTo(-0.1, 4);
  });

  it("describes a stop hit with slippage better than planned", () => {
    const r = exitRationale(
      {
        ...baseRow,
        exit_reason: "stop",
        actual_exit: 524.6, // better fill than planned $524.50 stop
        realized_pnl: -90,
        realized_r: -0.9,
      },
      "2026-01-01T10:00:00-05:00",
    );
    expect(r.slippage).toBeCloseTo(0.1, 4);
  });

  it("describes a force_flat with no plannedExit (no slippage concept)", () => {
    const r = exitRationale(
      {
        ...baseRow,
        status: "force_flat",
        exit_reason: "force_flat",
        actual_exit: 526.0,
        realized_pnl: 40,
        realized_r: 0.4,
      },
      "2026-01-01T10:00:00-05:00",
    );
    expect(r.reason).toBe("force_flat");
    expect(r.reasonLabel).toBe("Force flat");
    expect(r.plannedExit).toBeNull();
    expect(r.slippage).toBeNull();
  });

  it("computes trade duration in minutes from entry timestamp", () => {
    const r = exitRationale(baseRow, "2026-01-01T10:00:00-05:00");
    // exit 10:30, entry 10:00 → 30 min.
    expect(r.durationMinutes).toBe(30);
  });

  it("durationMinutes is null when entry timestamp is unknown", () => {
    const r = exitRationale(baseRow, null);
    expect(r.durationMinutes).toBeNull();
  });
});
