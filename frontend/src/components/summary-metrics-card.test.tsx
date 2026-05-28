import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SummaryMetricsCard } from "./summary-metrics-card";
import type { SummaryMetricsView } from "@/api/types";

const summary: SummaryMetricsView = {
  total_trades: 4,
  wins: 1,
  losses: 2,
  win_rate: 0.25,
  average_win_r: 2.0,
  average_loss_r: -1.0,
  average_r: 0.399,
  total_r: 1.596,
  profit_factor: 1.0,
  max_drawdown_r: -2.0,
  best_trade_r: 2.0,
  worst_trade_r: -1.0,
  longest_consecutive_loss_streak: 2,
  rejected_signal_count: 66,
  rejection_breakdown: {},
};

describe("SummaryMetricsCard", () => {
  it("renders all 7 metrics", () => {
    render(<SummaryMetricsCard summary={summary} />);
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("25.0%")).toBeInTheDocument();
    expect(screen.getByText("+1.596")).toBeInTheDocument();
    expect(screen.getByText("-2.000R")).toBeInTheDocument();
    expect(screen.getByText("1.000")).toBeInTheDocument();
  });

  it("renders HelpTooltips for measure concepts", () => {
    render(<SummaryMetricsCard summary={summary} />);
    expect(document.querySelector('[data-help-key="r_multiple"]')).toBeTruthy();
    expect(
      document.querySelector('[data-help-key="profit_factor"]'),
    ).toBeTruthy();
    expect(document.querySelector('[data-help-key="max_drawdown"]')).toBeTruthy();
    expect(document.querySelector('[data-help-key="win_rate"]')).toBeTruthy();
  });
});
