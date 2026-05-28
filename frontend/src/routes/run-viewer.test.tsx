import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { RunViewer } from "./run-viewer";

const summary = {
  total_trades: 4,
  wins: 1,
  losses: 2,
  win_rate: 0.25,
  average_win_r: 2.0,
  average_loss_r: -1.0,
  average_r: 0.399,
  total_r: 1.596,
  profit_factor: 1.0,
  max_drawdown_r: -2.0,
  best_trade_r: 2.0,
  worst_trade_r: -1.0,
  longest_consecutive_loss_streak: 2,
  rejected_signal_count: 0,
  rejection_breakdown: {},
};

const manifest = {
  run_id: "r1",
  run_started_at: "2026-01-02T10:00:00+00:00",
  run_ended_at: "2026-01-02T10:00:01+00:00",
  code_version: "abc12345",
  config_snapshot: {},
  data_fingerprint: {
    sha256: "deadbeefcafebabe",
    bar_count: 0,
    earliest_timestamp: "x",
    latest_timestamp: "y",
    session_count: 1,
  },
  summary,
};

function mockFetchAll() {
  vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
    const u = String(url);
    if (u === "/api/runs")
      return Promise.resolve(
        new Response(
          JSON.stringify([
            { run_id: "r1", started_at: "x", summary },
          ]),
        ),
      );
    if (u.endsWith("/journal")) return Promise.resolve(new Response("[]"));
    if (u.endsWith("/summary"))
      return Promise.resolve(new Response(JSON.stringify(summary)));
    if (u.endsWith("/manifest"))
      return Promise.resolve(new Response(JSON.stringify(manifest)));
    return Promise.resolve(new Response("[]"));
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("RunViewer route", () => {
  it("renders header + summary + rejections + journal on happy path", async () => {
    mockFetchAll();
    render(
      <MemoryRouter initialEntries={["/runs/r1"]}>
        <Routes>
          <Route path="/runs/:run_id" element={<RunViewer />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getAllByText("r1").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("Summary")).toBeInTheDocument();
    // "Rejections" rendered twice (the title shows in both the sidebar
    // Summary column and the RejectionBreakdownCard heading).
    expect(screen.getAllByText(/Rejections/i).length).toBeGreaterThan(0);
  });

  it("M1 — when one endpoint 404s, the other sections still render", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const u = String(url);
      if (u === "/api/runs")
        return Promise.resolve(
          new Response(
            JSON.stringify([
              { run_id: "r1", started_at: "x", summary },
            ]),
          ),
        );
      if (u.endsWith("/journal"))
        return Promise.resolve(
          new Response(JSON.stringify({ error: "run_not_found" }), {
            status: 404,
          }),
        );
      if (u.endsWith("/summary"))
        return Promise.resolve(new Response(JSON.stringify(summary)));
      if (u.endsWith("/manifest"))
        return Promise.resolve(new Response(JSON.stringify(manifest)));
      return Promise.resolve(new Response("[]"));
    });
    render(
      <MemoryRouter initialEntries={["/runs/r1"]}>
        <Routes>
          <Route path="/runs/:run_id" element={<RunViewer />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/Error: run_not_found/)).toBeInTheDocument(),
    );
    // Header + summary still rendered ("r1" appears in sidebar + header).
    expect(screen.getAllByText("r1").length).toBeGreaterThan(0);
    expect(screen.getByText("Summary")).toBeInTheDocument();
  });
});
