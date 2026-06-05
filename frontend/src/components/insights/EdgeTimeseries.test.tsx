import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EdgeTimeseries } from "./EdgeTimeseries";
import type { EdgeTimeseriesPoint } from "@/api/types";

const pt = (over: Partial<EdgeTimeseriesPoint>): EdgeTimeseriesPoint => ({
  run_id: "r1",
  study_id: "s1",
  window_index: 0,
  config_name: "wf-rr3",
  range_start: "2019-01-02",
  range_end: "2019-06-28",
  trades: 227,
  net_pnl: 118,
  expectancy_dollars: 0.52,
  expectancy_r: 0.018,
  pnl_std: 39.5,
  ...over,
});

const POINTS = [
  pt({ run_id: "r1" }),
  pt({ run_id: "r2", range_start: "2019-07-01", net_pnl: -396, expectancy_dollars: -1.82 }),
  pt({ run_id: "r3", config_name: "default", net_pnl: 60, expectancy_dollars: 0.3 }),
];

describe("EdgeTimeseries", () => {
  it("renders one point per OOS window grouped into per-config series", () => {
    const { container } = render(<EdgeTimeseries points={POINTS} onOpenRun={vi.fn()} />);
    expect(container.querySelectorAll("[data-testid='ls-point']")).toHaveLength(3);
    expect(screen.getByText("wf-rr3")).toBeInTheDocument();
    expect(screen.getByText("default")).toBeInTheDocument();
  });

  it("clicking a point opens its child run", () => {
    const onOpenRun = vi.fn();
    const { container } = render(<EdgeTimeseries points={POINTS} onOpenRun={onOpenRun} />);
    fireEvent.click(container.querySelectorAll("[data-testid='ls-point']")[0]);
    expect(onOpenRun).toHaveBeenCalledWith(expect.stringMatching(/^r[123]$/));
  });

  it("shows an instructive empty state for an empty archive", () => {
    render(<EdgeTimeseries points={[]} onOpenRun={vi.fn()} />);
    expect(screen.getByText(/no out-of-sample windows yet/i)).toBeInTheDocument();
  });

  it("explains itself with a HelpTooltip", () => {
    const { container } = render(<EdgeTimeseries points={POINTS} onOpenRun={vi.fn()} />);
    expect(container.querySelector('[data-help-key="edge_timeseries"]')).toBeTruthy();
  });
});
