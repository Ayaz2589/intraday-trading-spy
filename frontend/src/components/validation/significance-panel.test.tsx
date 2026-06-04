import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SignificancePanel } from "./significance-panel";
import type { SignificanceResult } from "@/api/types";

const sig: SignificanceResult = {
  confidence: 0.95,
  bootstrap: [
    { statistic: "expectancy_dollars", point: 1.2, low: 0.3, high: 2.7 },
    { statistic: "sharpe", point: 0.4, low: -0.1, high: 0.95 },
  ],
  permutation_metric: "total_net_pnl_dollars",
  observed: 246.0,
  p_value: 0.03,
  alpha: 0.05,
  significant: true,
  bootstrap_iterations: 1000,
  permutation_iterations: 1000,
  seed: 20260603,
};

describe("SignificancePanel", () => {
  it("renders bootstrap CIs, p-value and a significant verdict, with tooltips", () => {
    render(<SignificancePanel result={sig} />);
    expect(screen.getByText(/expectancy_dollars/i)).toBeInTheDocument();
    expect(screen.getByTestId("significance-verdict")).toHaveTextContent(/significant/i);
    expect(screen.getByText(/0\.03/)).toBeInTheDocument();
    for (const key of ["bootstrap_ci", "permutation_test"]) {
      expect(document.querySelector(`[data-help-key="${key}"]`)).toBeTruthy();
    }
  });

  it("shows a not-significant verdict", () => {
    render(<SignificancePanel result={{ ...sig, p_value: 0.4, significant: false }} />);
    expect(screen.getByTestId("significance-verdict")).toHaveTextContent(/not significant/i);
  });

  it("labels an undetermined verdict when p-value is null", () => {
    render(<SignificancePanel result={{ ...sig, p_value: null, significant: false }} />);
    expect(screen.getByTestId("significance-verdict")).toHaveTextContent(/undetermined|insufficient/i);
  });
});
