import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it("renders the status text", () => {
    render(<StatusBadge status="executed" />);
    expect(screen.getByText("Executed")).toBeInTheDocument();
  });

  it("applies color class based on status", () => {
    const { rerender } = render(<StatusBadge status="executed" />);
    expect(screen.getByText("Executed").className).toMatch(/green/);
    rerender(<StatusBadge status="rejected" />);
    expect(screen.getByText("Rejected").className).toMatch(/red/);
  });
});
