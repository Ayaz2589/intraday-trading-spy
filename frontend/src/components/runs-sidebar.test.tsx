import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, it, expect } from "vitest";
import { RunsSidebar } from "./runs-sidebar";
import type { RunSummaryView } from "@/api/types";

const runs: RunSummaryView[] = [
  {
    run_id: "r1",
    started_at: "2026-01-02T10:00:00+00:00",
    summary: {
      total_trades: 1,
    } as RunSummaryView["summary"],
  },
  {
    run_id: "r2",
    started_at: "2026-01-01T10:00:00+00:00",
    summary: {
      total_trades: 0,
    } as RunSummaryView["summary"],
  },
];

describe("RunsSidebar", () => {
  it("renders runs", () => {
    render(
      <MemoryRouter>
        <RunsSidebar runs={runs} selectedRunId="r1" />
      </MemoryRouter>,
    );
    expect(screen.getByText("r1")).toBeInTheDocument();
    expect(screen.getByText("r2")).toBeInTheDocument();
  });

  it("highlights the selected run", () => {
    render(
      <MemoryRouter>
        <RunsSidebar runs={runs} selectedRunId="r1" />
      </MemoryRouter>,
    );
    const li = screen.getByText("r1").closest("li");
    expect(li).toHaveAttribute("data-selected", "true");
  });

  it("shows the empty state when no runs", () => {
    render(
      <MemoryRouter>
        <RunsSidebar runs={[]} selectedRunId={null} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/No runs yet/i)).toBeInTheDocument();
    expect(screen.getByText("make backtest")).toBeInTheDocument();
  });
});
