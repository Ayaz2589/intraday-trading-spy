import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { WalkForwardTable } from "./walk-forward-table";
import type { WalkForwardResult } from "@/api/types";

function _win(idx: number, isExp: number, oosExp: number, lowConf = false): WalkForwardResult["windows"][number] {
  const mk = (seg: "train" | "validation", exp: number) => ({
    segment: seg, range_start: "2020-01-01", range_end: "2020-06-30", run_id: `r${idx}-${seg}`,
    total_trades: 100, expectancy_dollars: exp, expectancy_r: exp / 10, win_rate: 0.45,
    profit_factor: 1.1, sharpe: 0.3, total_net_pnl_dollars: exp * 100, low_confidence: lowConf,
  });
  return {
    window_index: idx, in_sample: mk("train", isExp), out_of_sample: mk("validation", oosExp),
    gap: { expectancy_dollars: oosExp - isExp, expectancy_r: (oosExp - isExp) / 10, sharpe: -0.2 },
  };
}

const result: WalkForwardResult = {
  mode: "rolling", train_months: 12, step_months: 6, validation_months: 6,
  windows: [_win(0, 3.0, 2.5), _win(1, 3.0, -5.0, true)], // window 1 = big overfit drop
  mean_oos: { expectancy_dollars: -1.25, sharpe: 0.1 },
  mean_gap: { expectancy_dollars: -4.25, expectancy_r: -0.425, sharpe: -0.2 },
};

describe("WalkForwardTable", () => {
  it("renders a row per window with IS, OOS and the gap, plus tooltips", () => {
    render(<WalkForwardTable result={result} />);
    expect(screen.getAllByTestId("wf-window-row")).toHaveLength(2);
    // Concept tooltips present (Principle VI).
    for (const key of ["walk_forward", "in_sample", "out_of_sample", "is_oos_gap"]) {
      expect(document.querySelector(`[data-help-key="${key}"]`)).toBeTruthy();
    }
  });

  it("flags a window whose OOS collapses vs IS as likely overfit", () => {
    render(<WalkForwardTable result={result} overfitGapWarn={0.1} />);
    const rows = screen.getAllByTestId("wf-window-row");
    // window 0 (small gap) not flagged; window 1 (large negative gap) flagged.
    expect(rows[0].getAttribute("data-overfit")).toBe("false");
    expect(rows[1].getAttribute("data-overfit")).toBe("true");
  });

  it("shows the aggregate mean OOS / mean gap", () => {
    render(<WalkForwardTable result={result} />);
    expect(screen.getByTestId("wf-mean-oos")).toBeInTheDocument();
    expect(screen.getByTestId("wf-mean-gap")).toBeInTheDocument();
  });

  it("handles an empty study gracefully", () => {
    render(<WalkForwardTable result={{ ...result, windows: [] }} />);
    expect(screen.getByText(/no windows/i)).toBeInTheDocument();
  });
});
