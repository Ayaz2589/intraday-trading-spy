import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ConfigDistribution } from "./ConfigDistribution";

const ROWS = [
  {
    config_name: "default", windows: 12, windows_positive: 9,
    pnl_q25: -50, pnl_q50: 124, pnl_q75: 420,
    expectancy_q25: -0.3, expectancy_q50: 0.6, expectancy_q75: 1.9,
    r_q25: -0.05, r_q50: 0.02, r_q75: 0.08,
    win_rate: 0.41, profit_factor: 1.05, account_value: 2500000,
    gate_passed: null, gate_ci_low: null, gate_ci_high: null,
    gate_computed_at: null, gate_study_id: null,
    total_trades: 2600,
  },
  {
    config_name: "wf-rr3", windows: 12, windows_positive: 7,
    pnl_q25: -120, pnl_q50: 61, pnl_q75: 510,
    expectancy_q25: -0.6, expectancy_q50: 0.3, expectancy_q75: 2.4,
    r_q25: -0.06, r_q50: 0.03, r_q75: 0.09,
    win_rate: 0.39, profit_factor: 1.12, account_value: 1000,
    gate_passed: false, gate_ci_low: -0.71, gate_ci_high: 2.6,
    gate_computed_at: "2026-06-05T13:00:00Z", gate_study_id: "study-9",
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

describe("ConfigDistribution — enrichment (016-polish)", () => {
  it("shows account size, win rate, profit factor and window-R median per config", () => {
    render(<ConfigDistribution rows={ROWS} />);
    const wf = screen.getByTestId("dist-row-wf-rr3");
    expect(wf).toHaveTextContent("39%");
    expect(wf).toHaveTextContent("1.12");
    expect(wf).toHaveTextContent("0.03");
    expect(wf).toHaveTextContent(/\$1,000/);
    const def = screen.getByTestId("dist-row-default");
    expect(def).toHaveTextContent(/\$2,500,000/);
  });

  it("shows each config's latest gate verdict as a chip linking to the study", () => {
    const onOpenStudy = vi.fn();
    render(<ConfigDistribution rows={ROWS} onOpenStudy={onOpenStudy} />);
    const chip = screen.getByRole("button", { name: /not passed/i });
    fireEvent.click(chip);
    expect(onOpenStudy).toHaveBeenCalledWith("study-9");
    // configs without a computed gate show a quiet placeholder
    expect(screen.getByTestId("dist-row-default")).toHaveTextContent(/no gate/i);
  });
});

describe("ConfigDistribution — signed value coloring (redesign)", () => {
  it("colors negative quartiles as loss and positive as profit", () => {
    render(<ConfigDistribution rows={ROWS} />);
    const wf = screen.getByTestId("dist-row-wf-rr3");
    const neg = within(wf).getByText("-0.06");
    expect(neg.getAttribute("style")).toContain("--loss");
    const pos = within(wf).getByText("0.09");
    expect(pos.getAttribute("style")).toContain("--profit");
  });
});
