import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Root } from "./root";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Root route", () => {
  it("redirects to /runs/{first} when runs exist", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            run_id: "r1",
            started_at: "2026-01-02T10:00:00+00:00",
            summary: {},
          },
        ]),
      ),
    );
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Root />} />
          <Route path="/runs/:run_id" element={<div>VIEWER LOADED</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText("VIEWER LOADED")).toBeInTheDocument(),
    );
  });

  it("shows the empty state when no runs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]"));
    render(
      <MemoryRouter>
        <Root />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/No backtest runs yet/i)).toBeInTheDocument(),
    );
    expect(screen.getByText("make backtest")).toBeInTheDocument();
  });
});
