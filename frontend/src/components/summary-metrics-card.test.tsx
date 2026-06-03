import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SummaryMetricsCard } from "./summary-metrics-card";
import type { SummaryMetricsView } from "@/api/legacy-types";

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
  // Feature 010 metrics
  total_pnl_dollars: 118.0,
  total_net_pnl_dollars: 118.0,
  total_fees_dollars: 0.0,
  total_slippage_dollars: 2.64,
  expectancy_r: 0.25,
  expectancy_dollars: 29.5,
  sharpe: 1.12,
  sortino: 1.54,
  max_drawdown_dollars: 340.0,
  max_drawdown_pct: 0.0136,
  return_median_dollars: -1.5,
  return_std_dollars: 22.4,
  return_skew: -0.3,
};

describe("SummaryMetricsCard", () => {
  it("renders the original metrics", () => {
    render(<SummaryMetricsCard summary={summary} />);
    // total_trades (4) now shows in both "Total Trades" and "Sample (N)"
    expect(screen.getAllByText("4").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("25.0%")).toBeInTheDocument();
    expect(screen.getByText("+1.596")).toBeInTheDocument();
    expect(screen.getByText("-2.000R")).toBeInTheDocument();
  });

  it("renders the Feature 010 net-of-cost metrics", () => {
    render(<SummaryMetricsCard summary={summary} />);
    expect(screen.getByText("1.12")).toBeInTheDocument(); // sharpe
    expect(screen.getByText("1.54")).toBeInTheDocument(); // sortino
    expect(screen.getByText("0.250R")).toBeInTheDocument(); // expectancy
    expect(screen.getByText("$340.00")).toBeInTheDocument(); // max dd $
    expect(screen.getByText("1.36%")).toBeInTheDocument(); // max dd %
    expect(screen.getByText("$2.64")).toBeInTheDocument(); // slippage
  });

  it("renders HelpTooltips for every new concept", () => {
    render(<SummaryMetricsCard summary={summary} />);
    for (const key of [
      "expectancy",
      "sharpe",
      "sortino",
      "drawdown_money",
      "drawdown_pct",
      "return_distribution",
      "slippage",
      "fees",
    ]) {
      expect(document.querySelector(`[data-help-key="${key}"]`)).toBeTruthy();
    }
  });

  it("renders sample size, win-rate CI, and a noise badge for thin samples", () => {
    const thin: SummaryMetricsView = {
      ...summary,
      total_trades: 6,
      low_confidence: true,
      win_rate_ci_low: 0.12,
      win_rate_ci_high: 0.74,
    };
    render(<SummaryMetricsCard summary={thin} />);
    expect(screen.getByText(/noise/i)).toBeInTheDocument();
    expect(screen.getByText("12–74%")).toBeInTheDocument();
    expect(document.querySelector('[data-help-key="sample_size"]')).toBeTruthy();
    expect(
      document.querySelector('[data-help-key="confidence_interval"]'),
    ).toBeTruthy();
  });

  it("hides the noise badge for large samples", () => {
    const big: SummaryMetricsView = {
      ...summary,
      total_trades: 400,
      low_confidence: false,
      win_rate_ci_low: 0.46,
      win_rate_ci_high: 0.54,
    };
    render(<SummaryMetricsCard summary={big} />);
    expect(screen.queryByText(/noise/i)).toBeNull();
  });

  it("renders an em dash for null/missing metrics (degenerate runs)", () => {
    const empty: SummaryMetricsView = {
      ...summary,
      sharpe: null,
      sortino: null,
      expectancy_r: null,
      max_drawdown_pct: null,
      return_median_dollars: null,
    };
    render(<SummaryMetricsCard summary={empty} />);
    // at least one em dash present for the nulled metrics
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
