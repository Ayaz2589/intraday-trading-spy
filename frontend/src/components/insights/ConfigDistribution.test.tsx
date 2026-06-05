import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ConfigDistribution } from "./ConfigDistribution";

const ROWS = [
  {
    config_name: "default", windows: 12, windows_positive: 9,
    pnl_q25: -50, pnl_q50: 124, pnl_q75: 420,
    expectancy_q25: -0.3, expectancy_q50: 0.6, expectancy_q75: 1.9,
    total_trades: 2600,
  },
  {
    config_name: "wf-rr3", windows: 12, windows_positive: 7,
    pnl_q25: -120, pnl_q50: 61, pnl_q75: 510,
    expectancy_q25: -0.6, expectancy_q50: 0.3, expectancy_q75: 2.4,
    total_trades: 2607,
  },
];

describe("ConfigDistribution", () => {
  it("renders configs side by side with window stats and quartiles", () => {
    render(<ConfigDistribution rows={ROWS} />);
    const wf = screen.getByTestId("dist-row-wf-rr3");
    expect(wf).toHaveTextContent(/7\s*\/\s*12/);
    expect(wf).toHaveTextContent("61");
    const def = screen.getByTestId("dist-row-default");
    expect(def).toHaveTextContent(/9\s*\/\s*12/);
    expect(def).toHaveTextContent("124");
  });

  it("shows an empty state when there is nothing to compare", () => {
    render(<ConfigDistribution rows={[]} />);
    expect(screen.getByText(/no configs to compare yet/i)).toBeInTheDocument();
  });

  it("explains itself with a HelpTooltip", () => {
    const { container } = render(<ConfigDistribution rows={ROWS} />);
    expect(container.querySelector('[data-help-key="window_distribution"]')).toBeTruthy();
  });
});
