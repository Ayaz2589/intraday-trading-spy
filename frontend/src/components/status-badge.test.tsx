import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it("renders the status text", () => {
    render(<StatusBadge status="executed" />);
    expect(screen.getByText("executed")).toBeInTheDocument();
  });

  it("applies color class based on status", () => {
    const { rerender } = render(<StatusBadge status="executed" />);
    expect(screen.getByText("executed").className).toMatch(/green/);
    rerender(<StatusBadge status="rejected" />);
    expect(screen.getByText("rejected").className).toMatch(/red/);
  });
});
