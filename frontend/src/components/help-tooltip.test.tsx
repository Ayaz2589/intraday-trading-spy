import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { HelpTooltip } from "./help-tooltip";

describe("HelpTooltip", () => {
  it("renders a ? button with data-help-key attribute", () => {
    render(<HelpTooltip helpKey="vwap" />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("data-help-key", "vwap");
  });

  it("opens popover with title + description on click", async () => {
    render(<HelpTooltip helpKey="vwap" />);
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("VWAP")).toBeInTheDocument();
    expect(
      await screen.findByText(/Volume-weighted average price/),
    ).toBeInTheDocument();
  });
});
