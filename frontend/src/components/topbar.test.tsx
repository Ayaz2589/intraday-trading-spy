import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router";
import { Topbar } from "./topbar";

function renderTopbar() {
  return render(
    <MemoryRouter>
      <Topbar
        currentRunId={null}
        onRunChange={() => {}}
      />
    </MemoryRouter>,
  );
}

describe("<Topbar>", () => {
  it("renders the brand block with wordmark and ticker pill", () => {
    renderTopbar();
    expect(screen.getByText(/Intraday/i)).toBeInTheDocument();
    expect(screen.getByText(/Builder/i)).toBeInTheDocument();
    // SPY · 5m is the ticker pill.
    expect(screen.getByText(/SPY/)).toBeInTheDocument();
  });

  it("mounts the theme toggle button", () => {
    renderTopbar();
    expect(screen.getByRole("button", { name: /theme/i })).toBeInTheDocument();
  });

  it("renders as a banner-style header element", () => {
    const { container } = renderTopbar();
    const topbar = container.querySelector("header.topbar");
    expect(topbar).not.toBeNull();
  });
});
