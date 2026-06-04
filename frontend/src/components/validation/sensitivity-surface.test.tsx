import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SensitivitySurface } from "./sensitivity-surface";
import type { SensitivitySurface as Surface } from "@/api/types";

const RR = "strategy.vwap_pullback.target.risk_reward";
const DIST = "strategy.vwap_pullback.max_distance_from_vwap_pct";

const surface1d: Surface = {
  metric_name: "expectancy_dollars",
  knobs: [RR],
  axes: { [RR]: [1.5, 2.0, 2.5] },
  segment: "train",
  points: [
    { coords: { [RR]: 1.5 }, metric: 0.5, trade_count: 100, low_confidence: false, run_id: "a" },
    { coords: { [RR]: 2.0 }, metric: 2.4, trade_count: 100, low_confidence: false, run_id: "b" },
    { coords: { [RR]: 2.5 }, metric: 1.1, trade_count: 10, low_confidence: true, run_id: "c" },
  ],
};

const surface2d: Surface = {
  metric_name: "expectancy_dollars",
  knobs: [RR, DIST],
  axes: { [RR]: [1.5, 2.0], [DIST]: [0.2, 0.3] },
  segment: "train",
  points: [
    { coords: { [RR]: 1.5, [DIST]: 0.2 }, metric: 0.1, trade_count: 50, low_confidence: false, run_id: "1" },
    { coords: { [RR]: 2.0, [DIST]: 0.2 }, metric: 0.9, trade_count: 50, low_confidence: false, run_id: "2" },
    { coords: { [RR]: 1.5, [DIST]: 0.3 }, metric: 0.4, trade_count: 50, low_confidence: false, run_id: "3" },
    { coords: { [RR]: 2.0, [DIST]: 0.3 }, metric: 1.5, trade_count: 50, low_confidence: false, run_id: "4" },
  ],
};

describe("SensitivitySurface", () => {
  it("renders a cell per grid point (1-D) with tooltips", () => {
    render(<SensitivitySurface surface={surface1d} />);
    expect(screen.getAllByTestId("surface-cell")).toHaveLength(3);
    for (const key of ["parameter_sensitivity", "plateau_vs_peak"]) {
      expect(document.querySelector(`[data-help-key="${key}"]`)).toBeTruthy();
    }
  });

  it("marks the peak cell and low-confidence cells", () => {
    render(<SensitivitySurface surface={surface1d} />);
    const cells = screen.getAllByTestId("surface-cell");
    const peak = cells.find((c) => c.getAttribute("data-peak") === "true");
    expect(peak?.textContent).toContain("2.40");
    expect(cells.some((c) => c.getAttribute("data-low-confidence") === "true")).toBe(true);
  });

  it("renders a 2-D grid (4 cells across two axes)", () => {
    render(<SensitivitySurface surface={surface2d} />);
    expect(screen.getAllByTestId("surface-cell")).toHaveLength(4);
  });

  it("handles an empty surface", () => {
    render(<SensitivitySurface surface={{ ...surface1d, points: [] }} />);
    expect(screen.getByText(/no grid points/i)).toBeInTheDocument();
  });
});
