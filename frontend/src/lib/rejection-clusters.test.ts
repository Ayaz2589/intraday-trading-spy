import { describe, it, expect } from "vitest";
import { clusterRejections } from "./rejection-clusters";
import type { BarView, JournalRowView } from "@/api/types";

const baseBar: Omit<BarView, "timestamp"> = {
  symbol: "SPY",
  open: 525,
  high: 525.5,
  low: 524.5,
  close: 525.2,
  volume: 1000,
};

function bar(ts: string): BarView {
  return { ...baseBar, timestamp: ts };
}

const baseRow: Omit<JournalRowView, "timestamp" | "rejection_check"> = {
  row_seq: 0,
  status: "rejected",
  setup: "vwap_pullback_long",
  direction: "long",
  planned_entry: null,
  stop_loss: null,
  take_profit: null,
  quantity: null,
  planned_risk_dollars: null,
  actual_entry: null,
  actual_exit: null,
  exit_reason: null,
  realized_pnl: null,
  realized_r: null,
  vwap: null,
  or_high: null,
  or_low: null,
  distance_from_vwap_pct: null,
  prior_bar_close: null,
  reason: "",
  same_bar_tiebreak: null,
};

function row(ts: string, check: string): JournalRowView {
  return { ...baseRow, timestamp: ts, rejection_check: check };
}

describe("clusterRejections (T-CLUSTER-1..T-CLUSTER-6 per states.md)", () => {
  it("returns empty for empty input (T-CLUSTER-1)", () => {
    expect(clusterRejections([], [bar("2026-05-26T09:30:00-04:00")])).toEqual(
      [],
    );
  });

  it("returns empty when bars list is empty", () => {
    expect(
      clusterRejections(
        [row("2026-05-26T09:30:00-04:00", "position_value_exceeds_cap")],
        [],
      ),
    ).toEqual([]);
  });

  it("single rejection → one cluster with count 1 (T-CLUSTER-2)", () => {
    const bars = [
      bar("2026-05-26T09:30:00-04:00"),
      bar("2026-05-26T09:35:00-04:00"),
    ];
    const rows = [row("2026-05-26T09:35:00-04:00", "position_value_exceeds_cap")];
    const out = clusterRejections(rows, bars);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      rejection_check: "position_value_exceeds_cap",
      first_timestamp: "2026-05-26T09:35:00-04:00",
      last_timestamp: "2026-05-26T09:35:00-04:00",
      count: 1,
      timestamps: ["2026-05-26T09:35:00-04:00"],
    });
  });

  it("3 consecutive same-reason rejections → single cluster, count 3 (T-CLUSTER-3)", () => {
    const ts = [
      "2026-05-26T09:30:00-04:00",
      "2026-05-26T09:35:00-04:00",
      "2026-05-26T09:40:00-04:00",
      "2026-05-26T09:45:00-04:00",
    ];
    const bars = ts.map(bar);
    const rows = [
      row(ts[1], "position_value_exceeds_cap"),
      row(ts[2], "position_value_exceeds_cap"),
      row(ts[3], "position_value_exceeds_cap"),
    ];
    const out = clusterRejections(rows, bars);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(3);
    expect(out[0].first_timestamp).toBe(ts[1]);
    expect(out[0].last_timestamp).toBe(ts[3]);
    expect(out[0].timestamps).toEqual([ts[1], ts[2], ts[3]]);
  });

  it("A, B, A on consecutive bars → 3 separate clusters (T-CLUSTER-4)", () => {
    const ts = [
      "2026-05-26T09:30:00-04:00",
      "2026-05-26T09:35:00-04:00",
      "2026-05-26T09:40:00-04:00",
    ];
    const bars = ts.map(bar);
    const rows = [
      row(ts[0], "position_value_exceeds_cap"),
      row(ts[1], "max_distance_from_vwap_exceeded"),
      row(ts[2], "position_value_exceeds_cap"),
    ];
    const out = clusterRejections(rows, bars);
    expect(out).toHaveLength(3);
    expect(out[0].rejection_check).toBe("position_value_exceeds_cap");
    expect(out[1].rejection_check).toBe("max_distance_from_vwap_exceeded");
    expect(out[2].rejection_check).toBe("position_value_exceeds_cap");
    expect(out.every((c) => c.count === 1)).toBe(true);
  });

  it("non-contiguous same-reason rejections → separate clusters by gap (T-CLUSTER-5)", () => {
    const ts = [
      "2026-05-26T09:30:00-04:00", // 0 rejected
      "2026-05-26T09:35:00-04:00", // 1 rejected
      "2026-05-26T09:40:00-04:00", // 2 GAP (no rejection)
      "2026-05-26T09:45:00-04:00", // 3 rejected
      "2026-05-26T09:50:00-04:00", // 4 rejected
      "2026-05-26T09:55:00-04:00", // 5 rejected
    ];
    const bars = ts.map(bar);
    const rows = [
      row(ts[0], "X"),
      row(ts[1], "X"),
      // gap
      row(ts[3], "X"),
      row(ts[4], "X"),
      row(ts[5], "X"),
    ];
    const out = clusterRejections(rows, bars);
    expect(out).toHaveLength(2);
    expect(out[0].count).toBe(2);
    expect(out[0].timestamps).toEqual([ts[0], ts[1]]);
    expect(out[1].count).toBe(3);
    expect(out[1].timestamps).toEqual([ts[3], ts[4], ts[5]]);
  });

  it("clusters are returned in chronological order of first_timestamp (T-CLUSTER-6)", () => {
    const ts = [
      "2026-05-26T09:30:00-04:00",
      "2026-05-26T09:35:00-04:00",
      "2026-05-26T09:40:00-04:00",
      "2026-05-26T09:45:00-04:00",
      "2026-05-26T09:50:00-04:00",
    ];
    const bars = ts.map(bar);
    // Input rows out of order on purpose.
    const rows = [
      row(ts[3], "Y"),
      row(ts[4], "Y"),
      row(ts[0], "X"),
      row(ts[1], "X"),
      row(ts[2], "X"),
    ];
    const out = clusterRejections(rows, bars);
    expect(out).toHaveLength(2);
    expect(out[0].first_timestamp).toBe(ts[0]);
    expect(out[1].first_timestamp).toBe(ts[3]);
  });

  it("silently drops rows whose timestamp does not match any bar", () => {
    const bars = [
      bar("2026-05-26T09:30:00-04:00"),
      bar("2026-05-26T09:35:00-04:00"),
    ];
    const rows = [
      row("2026-05-26T09:30:00-04:00", "X"),
      row("1999-01-01T00:00:00-04:00", "X"), // not in bars
    ];
    const out = clusterRejections(rows, bars);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(1);
  });

  it("is idempotent (calling twice yields equivalent output)", () => {
    const ts = ["2026-05-26T09:30:00-04:00", "2026-05-26T09:35:00-04:00"];
    const bars = ts.map(bar);
    const rows = [row(ts[0], "X"), row(ts[1], "X")];
    expect(clusterRejections(rows, bars)).toEqual(clusterRejections(rows, bars));
  });
});
