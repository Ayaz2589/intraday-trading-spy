import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, it, expect } from "vitest";
import { RunsSidebar } from "./runs-sidebar";
import type { RunSummaryView } from "@/api/types";

function makeRun(
  run_id: string,
  total_trades: number,
  total_r: number,
): RunSummaryView {
  return {
    run_id,
    started_at: "2026-01-02T10:00:00+00:00",
    summary: {
      total_trades,
      wins: 1,
      losses: 1,
      win_rate: 0.5,
      average_win_r: 2,
      average_loss_r: -1,
      average_r: total_r / Math.max(1, total_trades),
      total_r,
      profit_factor: total_r >= 0 ? 2 : 0.5,
      max_drawdown_r: -1,
      best_trade_r: 2,
      worst_trade_r: -1,
      longest_consecutive_loss_streak: 1,
      rejected_signal_count: 0,
      rejection_breakdown: {},
    },
  };
}

const runs = [makeRun("r1", 3, 1.5), makeRun("r2", 0, -0.75)];

describe("RunsSidebar", () => {
  it("renders the run-id of every run", () => {
    render(
      <MemoryRouter>
        <RunsSidebar runs={runs} selectedRunId="r1" />
      </MemoryRouter>,
    );
    expect(screen.getByText("r1")).toBeInTheDocument();
    expect(screen.getByText("r2")).toBeInTheDocument();
  });

  it("highlights the selected run with aria-current='page'", () => {
    render(
      <MemoryRouter>
        <RunsSidebar runs={runs} selectedRunId="r1" />
      </MemoryRouter>,
    );
    const active = screen.getByText("r1").closest("a");
    expect(active).toHaveAttribute("aria-current", "page");
    const inactive = screen.getByText("r2").closest("a");
    expect(inactive?.getAttribute("aria-current")).not.toBe("page");
  });

  it("shows P&L badge color-coded by sign (FR-009)", () => {
    render(
      <MemoryRouter>
        <RunsSidebar runs={runs} selectedRunId="r1" />
      </MemoryRouter>,
    );
    // r1 has +1.5R → profit badge
    const r1Item = screen.getByText("r1").closest("a") as HTMLElement;
    const profitBadge = within(r1Item).getByText(/\+1\.50R|\+1\.5R/);
    expect(profitBadge.className).toContain("badge-profit");
    // r2 has -0.75R → loss badge
    const r2Item = screen.getByText("r2").closest("a") as HTMLElement;
    const lossBadge = within(r2Item).getByText(/-0\.75R/);
    expect(lossBadge.className).toContain("badge-loss");
  });

  it("shows a trade count for each run", () => {
    render(
      <MemoryRouter>
        <RunsSidebar runs={runs} selectedRunId="r1" />
      </MemoryRouter>,
    );
    expect(screen.getByText("3t")).toBeInTheDocument();
    expect(screen.getByText("0t")).toBeInTheDocument();
  });

  it("renders a count pill that updates when the runs list changes (FR-020)", () => {
    const { rerender } = render(
      <MemoryRouter>
        <RunsSidebar runs={runs} selectedRunId="r1" />
      </MemoryRouter>,
    );
    expect(screen.getByText("2")).toBeInTheDocument(); // 2 runs in count pill
    rerender(
      <MemoryRouter>
        <RunsSidebar runs={[...runs, makeRun("r3", 1, 0)]} selectedRunId="r1" />
      </MemoryRouter>,
    );
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders the footer mini-legend with VWAP and OR dots (FR-015)", () => {
    render(
      <MemoryRouter>
        <RunsSidebar runs={runs} selectedRunId="r1" />
      </MemoryRouter>,
    );
    expect(screen.getByText(/VWAP/)).toBeInTheDocument();
    expect(screen.getByText(/OR/i)).toBeInTheDocument();
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
