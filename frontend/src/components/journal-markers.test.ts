import { describe, it, expect } from "vitest";
import { buildMarkers } from "./journal-markers";
import type { JournalRowView } from "@/api/types";

const baseRow: JournalRowView = {
  row_seq: 0,
  timestamp: "2026-01-01T09:30:00-05:00",
  status: "emitted",
  setup: null,
  direction: null,
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
  rejection_check: null,
  same_bar_tiebreak: null,
};

describe("buildMarkers", () => {
  it("creates an Entry marker for each executed row", () => {
    const rows: JournalRowView[] = [
      { ...baseRow, status: "executed", actual_entry: 525.45 },
    ];
    const markers = buildMarkers(rows, { showRejections: false });
    expect(markers).toHaveLength(1);
    expect(markers[0].shape).toBe("arrowUp");
    expect(markers[0].position).toBe("belowBar");
    expect(markers[0].text).toMatch(/^E /);
    expect(markers[0].text).toContain("525.45");
  });

  it("creates a green Exit marker on target exits with realized R and pnl", () => {
    const rows: JournalRowView[] = [
      {
        ...baseRow,
        status: "exited",
        actual_exit: 526.1,
        exit_reason: "target",
        realized_r: 1.0,
        realized_pnl: 200,
      },
    ];
    const markers = buildMarkers(rows, { showRejections: false });
    expect(markers).toHaveLength(1);
    expect(markers[0].color).toBe("#10b981");
    expect(markers[0].text).toMatch(/^T /);
    expect(markers[0].text).toContain("+1.0R");
  });

  it("creates a red Exit marker on stop exits", () => {
    const rows: JournalRowView[] = [
      {
        ...baseRow,
        status: "exited",
        actual_exit: 524.5,
        exit_reason: "stop",
        realized_r: -1.0,
        realized_pnl: -100,
      },
    ];
    const markers = buildMarkers(rows, { showRejections: false });
    expect(markers[0].color).toBe("#ef4444");
    expect(markers[0].text).toMatch(/^S /);
    expect(markers[0].text).toContain("-1.0R");
  });

  it("creates a gray force_flat marker", () => {
    const rows: JournalRowView[] = [
      {
        ...baseRow,
        status: "force_flat",
        actual_exit: 525.0,
        exit_reason: "force_flat",
        realized_r: 0,
        realized_pnl: 0,
      },
    ];
    const markers = buildMarkers(rows, { showRejections: false });
    expect(markers[0].color).toBe("#6b7280");
    expect(markers[0].text).toMatch(/^FF /);
  });

  it("omits rejection markers when showRejections=false", () => {
    const rows: JournalRowView[] = [
      { ...baseRow, status: "rejected", rejection_check: "position_value_exceeds_cap" },
    ];
    expect(buildMarkers(rows, { showRejections: false })).toHaveLength(0);
  });

  it("includes rejection markers when showRejections=true", () => {
    const rows: JournalRowView[] = [
      { ...baseRow, status: "rejected", rejection_check: "position_value_exceeds_cap" },
    ];
    const markers = buildMarkers(rows, { showRejections: true });
    expect(markers).toHaveLength(1);
    expect(markers[0].shape).toBe("square");
    expect(markers[0].text).toBe("✕");
  });
});
