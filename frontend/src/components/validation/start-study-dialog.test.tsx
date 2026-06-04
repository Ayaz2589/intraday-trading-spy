import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const startStudyMock = vi.fn();
const listConfigsMock = vi.fn();

vi.mock("@/api/validation", () => ({ startStudy: (b: unknown) => startStudyMock(b) }));
vi.mock("@/api/configs", () => ({ listConfigs: () => listConfigsMock() }));

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  return render(createElement(QueryClientProvider, { client }, ui));
}

beforeEach(() => {
  startStudyMock.mockReset();
  listConfigsMock.mockReset();
});

const cfg = (name: string) => ({ id: name, name, mode: "backtest", timeframe: "5m", strategy_id: "s", params: {} });

describe("StartStudyDialog config picker", () => {
  it("lists saved configs and launches the chosen one", async () => {
    listConfigsMock.mockResolvedValue({ configs: [cfg("default"), cfg("aggressive")] });
    startStudyMock.mockResolvedValue({ study_id: "x", status: "queued", planned_evaluations: 24 });
    const { StartStudyDialog } = await import("./start-study-dialog");
    wrap(createElement(StartStudyDialog));

    await waitFor(() => expect(screen.getByRole("option", { name: "aggressive" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("config"), { target: { value: "aggressive" } });
    fireEvent.click(screen.getByRole("button", { name: /launch study/i }));

    await waitFor(() =>
      expect(startStudyMock).toHaveBeenCalledWith(
        expect.objectContaining({ config_name: "aggressive", kind: "walk_forward" })
      )
    );
  });

  it("pre-selects the active config (Feature 012 SC-007)", async () => {
    listConfigsMock.mockResolvedValue({
      configs: [cfg("default"), { ...cfg("aggressive"), is_active: true }],
    });
    startStudyMock.mockResolvedValue({ study_id: "x", status: "queued", planned_evaluations: 24 });
    const { StartStudyDialog } = await import("./start-study-dialog");
    wrap(createElement(StartStudyDialog));
    // Without touching the picker, launching uses the active config.
    await waitFor(() => expect(screen.getByRole("option", { name: "aggressive" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /launch study/i }));
    await waitFor(() =>
      expect(startStudyMock).toHaveBeenCalledWith(expect.objectContaining({ config_name: "aggressive" }))
    );
  });

  it("falls back to the default config before the list loads", async () => {
    listConfigsMock.mockResolvedValue({ configs: [] });
    startStudyMock.mockResolvedValue({ study_id: "x", status: "queued", planned_evaluations: 24 });
    const { StartStudyDialog } = await import("./start-study-dialog");
    wrap(createElement(StartStudyDialog));
    fireEvent.click(screen.getByRole("button", { name: /launch study/i }));
    await waitFor(() =>
      expect(startStudyMock).toHaveBeenCalledWith(expect.objectContaining({ config_name: "default" }))
    );
  });
});
