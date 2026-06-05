import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { MonteCarloPanel } from "./monte-carlo-panel";
import type { MonteCarloResult } from "@/api/types";

const dist = (observed: number, p5: number, p25: number, p50: number, p75: number, p95: number) => ({
  observed, p5, p25, p50, p75, p95,
});

const FIXTURE: MonteCarloResult = {
  shuffle: {
    max_drawdown_pct: dist(0.091, 0.068, 0.089, 0.104, 0.126, 0.162),
    max_drawdown_dollars: dist(2275, 1700, 2225, 2600, 3150, 4050),
    longest_losing_streak: dist(5, 4, 5, 6, 7, 9),
    longest_underwater_trades: dist(41, 28, 40, 54, 71, 97),
  },
  cone: {
    horizon_trades: 312,
    steps: [
      { trade_index: 1, p5: 24850, p25: 24940, p50: 25010, p75: 25080, p95: 25170 },
      { trade_index: 156, p5: 24210, p25: 25390, p50: 26240, p75: 27110, p95: 28490 },
      { trade_index: 312, p5: 23100, p25: 25820, p50: 27940, p75: 30060, p95: 33310 },
    ],
  },
  terminal_equity: dist(27940, 23100, 25820, 27940, 30060, 33310),
  iterations: 2000,
  seed: 20260604,
  trade_count: 312,
  starting_equity: 25000,
  low_confidence: false,
};

describe("MonteCarloPanel (US1 — drawdown / path risk)", () => {
  it("renders observed vs P50/P95 for all four shuffle stats", () => {
    render(createElement(MonteCarloPanel, { result: FIXTURE }));
    for (const key of [
      "max_drawdown_pct",
      "max_drawdown_dollars",
      "longest_losing_streak",
      "longest_underwater_trades",
    ]) {
      expect(screen.getByTestId(`mc-stat-row-${key}`)).toBeInTheDocument();
    }
    // Observed drawdown fraction renders as a percent; P95 too.
    expect(screen.getByTestId("mc-stat-row-max_drawdown_pct")).toHaveTextContent("9.1%");
    expect(screen.getByTestId("mc-stat-row-max_drawdown_pct")).toHaveTextContent("16.2%");
    expect(screen.getByTestId("mc-stat-row-longest_losing_streak")).toHaveTextContent("5");
    expect(screen.getByTestId("mc-stat-row-longest_underwater_trades")).toHaveTextContent("41");
  });

  it("renders a distribution strip (P5–P95 band + observed marker) per stat", () => {
    render(createElement(MonteCarloPanel, { result: FIXTURE }));
    expect(screen.getAllByTestId("mc-distribution-strip")).toHaveLength(4);
  });

  it("echoes the reproducibility metadata", () => {
    render(createElement(MonteCarloPanel, { result: FIXTURE }));
    const meta = screen.getByTestId("mc-meta");
    expect(meta).toHaveTextContent(/2,?000/);
    expect(meta).toHaveTextContent("20260604");
    expect(meta).toHaveTextContent("312");
  });

  it("pairs every US1 concept with a HelpTooltip", () => {
    const { container } = render(createElement(MonteCarloPanel, { result: FIXTURE }));
    for (const key of [
      "shuffle_method",
      "max_drawdown_distribution",
      "losing_streak",
      "underwater_period",
      "mc_iterations_seed",
    ]) {
      expect(container.querySelector(`[data-help-key="${key}"]`)).toBeTruthy();
    }
  });
});

describe("MonteCarloPanel (US2 — forward cone)", () => {
  it("renders the fan chart with band polygons, a median line, and the horizon", () => {
    render(createElement(MonteCarloPanel, { result: FIXTURE }));
    const chart = screen.getByTestId("mc-cone-chart");
    // Two stacked band polygons (P5-P95 outer, P25-P75 core) + median polyline.
    expect(chart.querySelectorAll("polygon").length).toBeGreaterThanOrEqual(2);
    expect(chart.querySelectorAll("polyline").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("mc-cone-section")).toHaveTextContent(/next 312 trades/i);
  });

  it("shows terminal-equity percentiles with the observed ending equity", () => {
    render(createElement(MonteCarloPanel, { result: FIXTURE }));
    const term = screen.getByTestId("mc-terminal-equity");
    expect(term).toHaveTextContent("$23,100");
    expect(term).toHaveTextContent("$27,940");
    expect(term).toHaveTextContent("$33,310");
  });

  it("pairs the cone with its HelpTooltip", () => {
    const { container } = render(createElement(MonteCarloPanel, { result: FIXTURE }));
    expect(container.querySelector('[data-help-key="forward_cone"]')).toBeTruthy();
  });
});
