import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { RiskKnobs } from "./risk-knobs";

const baseConfig = {
  risk: {
    account_value: 25000,
    max_risk_per_trade_pct: 0.1,
    max_position_value_pct: 100,
    max_consecutive_losses: 2,
  },
  strategy: {
    opening_range: { minutes: 15 },
    vwap_pullback: {
      max_distance_from_vwap_pct: 0.25,
      target: { risk_reward: 2.0 },
    },
  },
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("RiskKnobs", () => {
  it("pre-fills inputs from fetched config", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (String(url) === "/api/config")
        return Promise.resolve(new Response(JSON.stringify(baseConfig)));
      if (String(url) === "/api/datasets")
        return Promise.resolve(new Response("[]"));
      return Promise.resolve(new Response("{}"));
    });
    render(<RiskKnobs onNewRun={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /customize/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/account value/i)).toHaveValue(25000);
    });
    expect(screen.getByLabelText(/risk per trade/i)).toHaveValue(0.1);
    expect(screen.getByLabelText(/position cap/i)).toHaveValue(100);
    expect(screen.getByLabelText(/consecutive losses/i)).toHaveValue(2);
    expect(screen.getByLabelText(/opening range/i)).toHaveValue(15);
    expect(screen.getByLabelText(/risk:reward/i)).toHaveValue(2);
    expect(screen.getByLabelText(/max distance from vwap/i)).toHaveValue(0.25);
  });

  it("includes max_distance_from_vwap_pct in the overrides payload", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (String(url) === "/api/config")
        return Promise.resolve(new Response(JSON.stringify(baseConfig)));
      if (String(url) === "/api/datasets")
        return Promise.resolve(new Response("[]"));
      if (String(url) === "/api/backtests/run")
        return Promise.resolve(
          new Response(JSON.stringify({ run_id: "x" })),
        );
      return Promise.resolve(new Response("{}"));
    });
    render(<RiskKnobs onNewRun={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /customize/i }));
    await waitFor(() =>
      expect(screen.getByLabelText(/max distance from vwap/i)).toHaveValue(
        0.25,
      ),
    );
    fireEvent.change(screen.getByLabelText(/max distance from vwap/i), {
      target: { value: "1.0" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: /run with these/i }),
    );
    await waitFor(() => {
      const runCall = fetchSpy.mock.calls.find(
        ([url]) => String(url) === "/api/backtests/run",
      );
      expect(runCall).toBeDefined();
      const body = JSON.parse((runCall![1] as RequestInit).body as string);
      expect(
        body.overrides.strategy.vwap_pullback.max_distance_from_vwap_pct,
      ).toBe(1.0);
    });
  });

  it("posts edited values as overrides and reports new run id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (String(url) === "/api/config")
        return Promise.resolve(new Response(JSON.stringify(baseConfig)));
      if (String(url) === "/api/datasets")
        return Promise.resolve(new Response("[]"));
      if (String(url) === "/api/backtests/run")
        return Promise.resolve(
          new Response(JSON.stringify({ run_id: "new-run-id" })),
        );
      return Promise.resolve(new Response("{}"));
    });
    const onNewRun = vi.fn();
    render(<RiskKnobs onNewRun={onNewRun} />);
    await userEvent.click(screen.getByRole("button", { name: /customize/i }));
    await waitFor(() =>
      expect(screen.getByLabelText(/risk per trade/i)).toHaveValue(0.1),
    );
    const riskInput = screen.getByLabelText(/risk per trade/i);
    fireEvent.change(riskInput, { target: { value: "0.5" } });
    await userEvent.click(
      screen.getByRole("button", { name: /run with these/i }),
    );
    await waitFor(() => expect(onNewRun).toHaveBeenCalledWith("new-run-id"));
    const runCall = fetchSpy.mock.calls.find(
      ([url]) => String(url) === "/api/backtests/run",
    );
    expect(runCall).toBeDefined();
    const body = JSON.parse((runCall![1] as RequestInit).body as string);
    expect(body.overrides.risk.max_risk_per_trade_pct).toBe(0.5);
    // un-edited fields should also be in the override payload so the
    // backend snapshots the full picture of what the user ran.
    expect(body.overrides.risk.account_value).toBe(25000);
  });

  it("Revert restores the originally-fetched values and disables itself when clean", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (String(url) === "/api/config")
        return Promise.resolve(new Response(JSON.stringify(baseConfig)));
      if (String(url) === "/api/datasets")
        return Promise.resolve(new Response("[]"));
      return Promise.resolve(new Response("{}"));
    });
    render(<RiskKnobs onNewRun={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /customize/i }));
    await waitFor(() =>
      expect(screen.getByLabelText(/risk per trade/i)).toHaveValue(0.1),
    );
    const revert = screen.getByRole("button", { name: /revert/i });
    expect(revert).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/risk per trade/i), {
      target: { value: "0.5" },
    });
    fireEvent.change(screen.getByLabelText(/account value/i), {
      target: { value: "100000" },
    });
    expect(revert).not.toBeDisabled();
    expect(screen.getByLabelText(/risk per trade/i)).toHaveValue(0.5);
    expect(screen.getByLabelText(/account value/i)).toHaveValue(100000);

    await userEvent.click(revert);
    expect(screen.getByLabelText(/risk per trade/i)).toHaveValue(0.1);
    expect(screen.getByLabelText(/account value/i)).toHaveValue(25000);
    expect(revert).toBeDisabled();
  });
});
