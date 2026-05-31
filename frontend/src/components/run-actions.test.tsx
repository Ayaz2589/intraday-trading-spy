import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { RunActions } from "./run-actions";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("RunActions", () => {
  it("'Delete this run' opens the in-app confirm dialog and deletes on Confirm", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ deleted: "r1" })),
    );
    const onCleared = vi.fn();
    render(
      <MemoryRouter>
        <RunActions currentRunId="r1" onCleared={onCleared} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: /delete this run/i }));
    // The custom dialog appears (alertdialog role) — no window.confirm fires.
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/runs/r1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(onCleared).toHaveBeenCalled();
  });

  it("'Delete this run' Cancel dismisses the dialog without calling the API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(
      <MemoryRouter>
        <RunActions currentRunId="r1" onCleared={() => {}} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: /delete this run/i }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("'Delete all runs' confirms via the in-app dialog then deletes everything", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ deleted_count: 5 })),
    );
    const onCleared = vi.fn();
    render(
      <MemoryRouter>
        <RunActions currentRunId={null} onCleared={onCleared} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: /delete all runs/i }));
    await userEvent.click(
      screen.getByRole("button", { name: /delete all$/i }),
    );
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
        <RunActions currentRunId={null} onCleared={() => {}} />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: /delete this run/i }),
    ).toBeDisabled();
  });
});
