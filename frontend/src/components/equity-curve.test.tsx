import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EquityCurve } from "./equity-curve";
import type { EquityPointView } from "@/api/legacy-types";

const points: EquityPointView[] = [
  { timestamp: null, equity: 25000, cumulative_net_pnl: 0 },
  { timestamp: "2026-03-01T14:35:00Z", equity: 25100, cumulative_net_pnl: 100 },
  { timestamp: "2026-03-02T14:35:00Z", equity: 24800, cumulative_net_pnl: -200 },
];

describe("EquityCurve", () => {
  it("renders an SVG path and the help tooltip", () => {
    const { container } = render(<EquityCurve points={points} />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("path")).toBeTruthy();
    expect(document.querySelector('[data-help-key="equity_curve"]')).toBeTruthy();
  });

  it("shows a fallback when there are too few points", () => {
    render(<EquityCurve points={[points[0]]} />);
    expect(screen.getByText(/not enough trades/i)).toBeInTheDocument();
  });
});
