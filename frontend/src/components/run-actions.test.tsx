import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { RunActions } from "./run-actions";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("RunActions", () => {
  it("clicking 'New backtest' POSTs and reports the new run id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ run_id: "new-run-id" })),
    );
    const onNewRun = vi.fn();
    render(
      <MemoryRouter>
        <RunActions currentRunId="r1" onNewRun={onNewRun} onCleared={() => {}} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: /new backtest/i }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/backtests/run",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(onNewRun).toHaveBeenCalledWith("new-run-id");
  });

  it("'Delete this run' confirms then deletes when accepted", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ deleted: "r1" })),
    );
    const onCleared = vi.fn();
    render(
      <MemoryRouter>
        <RunActions currentRunId="r1" onNewRun={() => {}} onCleared={onCleared} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: /delete this run/i }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/runs/r1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(onCleared).toHaveBeenCalled();
  });

  it("'Delete this run' does nothing when confirm is dismissed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(
      <MemoryRouter>
        <RunActions currentRunId="r1" onNewRun={() => {}} onCleared={() => {}} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: /delete this run/i }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("'Delete all runs' confirms then deletes everything", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ deleted_count: 5 })),
    );
    const onCleared = vi.fn();
    render(
      <MemoryRouter>
        <RunActions currentRunId={null} onNewRun={() => {}} onCleared={onCleared} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: /delete all runs/i }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/runs",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(onCleared).toHaveBeenCalled();
  });

  it("'Delete this run' is disabled when currentRunId is null", () => {
    render(
      <MemoryRouter>
        <RunActions currentRunId={null} onNewRun={() => {}} onCleared={() => {}} />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: /delete this run/i }),
    ).toBeDisabled();
  });
});
