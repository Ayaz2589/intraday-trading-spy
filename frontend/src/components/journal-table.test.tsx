import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { JournalTable } from "./journal-table";
import type { JournalRowView } from "@/api/types";

const rows: JournalRowView[] = [
  {
    row_seq: 0,
    timestamp: "2026-01-01T09:30:00-05:00",
    status: "executed",
    setup: "vwap_pullback_long",
    direction: "long",
    planned_entry: 525.1,
    stop_loss: 524.59,
    take_profit: 526.12,
    quantity: 19,
    planned_risk_dollars: 9.69,
    actual_entry: 525.45,
    actual_exit: null,
    exit_reason: null,
    realized_pnl: null,
    realized_r: null,
    vwap: 524.88,
    or_high: 525.0,
    or_low: 523.9,
    distance_from_vwap_pct: 0.04,
    prior_bar_close: 525.05,
    reason: "x",
    rejection_check: null,
    same_bar_tiebreak: null,
  },
];

describe("JournalTable", () => {
  it("renders all rows with their fields", () => {
    render(<JournalTable rows={rows} />);
    expect(screen.getByText("525.10")).toBeInTheDocument();
    expect(screen.getByText("19")).toBeInTheDocument();
    expect(screen.getByText("executed")).toBeInTheDocument();
  });

  it("renders HelpTooltips on relevant column headers", () => {
    render(<JournalTable rows={rows} />);
    expect(document.querySelector('[data-help-key="stop_loss"]')).toBeTruthy();
    expect(document.querySelector('[data-help-key="take_profit"]')).toBeTruthy();
    expect(
      document.querySelector('[data-help-key="risk_per_trade"]'),
    ).toBeTruthy();
  });
});
