import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConfigureRunMenu } from "./configure-run-menu";

const baseConfig = {
  data: { csv_path: "data/raw/spy_5m_sample.csv" },
  risk: {
    account_value: 25000,
    max_risk_per_trade_pct: 0.1,
    max_position_value_pct: 100,
    max_consecutive_losses: 2,
  },
  strategy: {
    enabled_setup: "vwap_pullback_long",
    opening_range: { minutes: 15 },
    vwap_pullback: {
      max_distance_from_vwap_pct: 0.25,
      target: { risk_reward: 2.0 },
    },
  },
};

const baseConfigs = [
  { name: "default", path: "config/config.yaml" },
  { name: "low-risk", path: "config/presets/low-risk.yaml" },
  { name: "vwap50", path: "config/presets/vwap50.yaml" },
];

function mockBackend(extra?: (url: string) => Response | undefined) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
    const u = String(url);
    const overridden = extra?.(u);
    if (overridden) return Promise.resolve(overridden);
    if (u === "/api/configs")
      return Promise.resolve(new Response(JSON.stringify(baseConfigs)));
    if (u === "/api/config")
      return Promise.resolve(new Response(JSON.stringify(baseConfig)));
    if (u === "/api/datasets")
      return Promise.resolve(new Response("[]"));
    return Promise.resolve(new Response("{}"));
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ConfigureRunMenu", () => {
  it("opens the popover with a strategy selector showing VWAP Pullback Long", async () => {
    mockBackend();
    render(<ConfigureRunMenu onNewRun={() => {}} />);
    await userEvent.click(
      screen.getByRole("button", { name: /run backtest/i }),
    );
    const strategySelect = await screen.findByLabelText(/strategy/i);
    expect(strategySelect).toHaveValue("vwap_pullback_long");
    expect(
      screen.getByRole("option", { name: /vwap pullback long/i }),
    ).toBeInTheDocument();
  });

  it("defaults to the Presets tab and lists configs from /api/configs", async () => {
    mockBackend();
    render(<ConfigureRunMenu onNewRun={() => {}} />);
    await userEvent.click(
      screen.getByRole("button", { name: /run backtest/i }),
    );
    await waitFor(() =>
      expect(screen.getByText("vwap50")).toBeInTheDocument(),
    );
    expect(screen.getByText("default")).toBeInTheDocument();
    expect(screen.getByText("low-risk")).toBeInTheDocument();
  });

  it("clicking a preset POSTs config_path and reports the new run id", async () => {
    const fetchSpy = mockBackend((url) => {
      if (url === "/api/backtests/run")
        return new Response(JSON.stringify({ run_id: "new-run-id" }));
    });
    const onNewRun = vi.fn();
    render(<ConfigureRunMenu onNewRun={onNewRun} />);
    await userEvent.click(
      screen.getByRole("button", { name: /run backtest/i }),
    );
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

  it("switching to the Custom tab pre-fills knobs from /api/config", async () => {
    mockBackend();
    render(<ConfigureRunMenu onNewRun={() => {}} />);
    await userEvent.click(
      screen.getByRole("button", { name: /run backtest/i }),
    );
    await userEvent.click(screen.getByRole("tab", { name: /custom/i }));
    await waitFor(() =>
      expect(screen.getByLabelText(/account value/i)).toHaveValue(25000),
    );
    expect(screen.getByLabelText(/risk per trade/i)).toHaveValue(0.1);
    expect(screen.getByLabelText(/max distance from vwap/i)).toHaveValue(0.25);
  });

  it("Custom tab posts edited values as overrides and reports new run id", async () => {
    const fetchSpy = mockBackend((url) => {
      if (url === "/api/backtests/run")
        return new Response(JSON.stringify({ run_id: "custom-run" }));
    });
    const onNewRun = vi.fn();
    render(<ConfigureRunMenu onNewRun={onNewRun} />);
    await userEvent.click(
      screen.getByRole("button", { name: /run backtest/i }),
    );
    await userEvent.click(screen.getByRole("tab", { name: /custom/i }));
    await waitFor(() =>
      expect(screen.getByLabelText(/risk per trade/i)).toHaveValue(0.1),
    );
    fireEvent.change(screen.getByLabelText(/risk per trade/i), {
      target: { value: "0.5" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: /run with these/i }),
    );
    await waitFor(() => expect(onNewRun).toHaveBeenCalledWith("custom-run"));
    const runCall = fetchSpy.mock.calls.find(
      ([url]) => String(url) === "/api/backtests/run",
    );
    const body = JSON.parse((runCall![1] as RequestInit).body as string);
    expect(body.overrides.risk.max_risk_per_trade_pct).toBe(0.5);
  });

  it("Custom tab Revert restores the originally-fetched values", async () => {
    mockBackend();
    render(<ConfigureRunMenu onNewRun={() => {}} />);
    await userEvent.click(
      screen.getByRole("button", { name: /run backtest/i }),
    );
    await userEvent.click(screen.getByRole("tab", { name: /custom/i }));
    await waitFor(() =>
      expect(screen.getByLabelText(/risk per trade/i)).toHaveValue(0.1),
    );
    const revert = screen.getByRole("button", { name: /revert/i });
    expect(revert).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/risk per trade/i), {
      target: { value: "0.5" },
    });
    expect(revert).not.toBeDisabled();
    await userEvent.click(revert);
    expect(screen.getByLabelText(/risk per trade/i)).toHaveValue(0.1);
    expect(revert).toBeDisabled();
  });
});
