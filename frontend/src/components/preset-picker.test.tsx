import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { PresetPicker } from "./preset-picker";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("PresetPicker", () => {
  it("lists default + presets fetched from /api/configs", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (String(url) === "/api/configs")
        return Promise.resolve(
          new Response(
            JSON.stringify([
              { name: "default", path: "config/config.yaml" },
              { name: "low-risk", path: "config/presets/low-risk.yaml" },
              { name: "vwap50", path: "config/presets/vwap50.yaml" },
            ]),
          ),
        );
      return Promise.resolve(new Response("{}"));
    });
    render(<PresetPicker onNewRun={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /presets/i }));
    await waitFor(() =>
      expect(screen.getByText("vwap50")).toBeInTheDocument(),
    );
    expect(screen.getByText("default")).toBeInTheDocument();
    expect(screen.getByText("low-risk")).toBeInTheDocument();
  });

  it("clicking a preset POSTs config_path and reports the new run id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (String(url) === "/api/configs")
        return Promise.resolve(
          new Response(
            JSON.stringify([
              { name: "default", path: "config/config.yaml" },
              { name: "vwap50", path: "config/presets/vwap50.yaml" },
            ]),
          ),
        );
      if (String(url) === "/api/backtests/run")
        return Promise.resolve(
          new Response(JSON.stringify({ run_id: "new-run-id" })),
        );
      return Promise.resolve(new Response("{}"));
    });
    const onNewRun = vi.fn();
    render(<PresetPicker onNewRun={onNewRun} />);
    await userEvent.click(screen.getByRole("button", { name: /presets/i }));
    await waitFor(() =>
      expect(screen.getByText("vwap50")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByText("vwap50"));
    await waitFor(() => expect(onNewRun).toHaveBeenCalledWith("new-run-id"));
    const runCall = fetchSpy.mock.calls.find(
      ([url]) => String(url) === "/api/backtests/run",
    );
    const body = JSON.parse((runCall![1] as RequestInit).body as string);
    expect(body.config_path).toBe("config/presets/vwap50.yaml");
  });
});
