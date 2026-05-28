import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RejectionBreakdownCard } from "./rejection-breakdown-card";

describe("RejectionBreakdownCard", () => {
  it("renders rejection reasons sorted by count descending", () => {
    const breakdown = {
      position_value_exceeds_cap: 100,
      no_new_trades_after: 5,
    };
    render(<RejectionBreakdownCard breakdown={breakdown} total={105} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("position_value_exceeds_cap");
    expect(items[1]).toHaveTextContent("no_new_trades_after");
  });

  it("renders HelpTooltip on the heading and on known rejection types", () => {
    render(
      <RejectionBreakdownCard
        breakdown={{ position_value_exceeds_cap: 10 }}
        total={10}
      />,
    );
    expect(
      document.querySelector('[data-help-key="rejected_signal"]'),
    ).toBeTruthy();
    expect(
      document.querySelector('[data-help-key="position_cap"]'),
    ).toBeTruthy();
  });

  it("shows 'No rejections.' when empty", () => {
    render(<RejectionBreakdownCard breakdown={{}} total={0} />);
    expect(screen.getByText(/No rejections/i)).toBeInTheDocument();
  });
});
