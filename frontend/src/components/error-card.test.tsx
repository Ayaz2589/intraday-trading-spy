import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ErrorCard } from "./error-card";

describe("<ErrorCard>", () => {
  it("renders the message verbatim", () => {
    render(<ErrorCard message="Something broke." />);
    expect(screen.getByText("Something broke.")).toBeInTheDocument();
  });

  it("has role='alert' for screen readers", () => {
    render(<ErrorCard message="x" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders the default title when none is supplied", () => {
    render(<ErrorCard message="x" />);
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
  });

  it("renders a custom title when supplied", () => {
    render(<ErrorCard title="Chart unavailable" message="boom" />);
    expect(screen.getByText("Chart unavailable")).toBeInTheDocument();
  });

  it("applies the .error-card class (loss accent rail)", () => {
    const { container } = render(<ErrorCard message="x" />);
    expect(container.firstElementChild?.className).toContain("error-card");
  });
});
