import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StrategyConfigCard } from "./strategy-config-card";
import type { RunManifestView } from "@/api/legacy-types";

const baseManifest: RunManifestView = {
  run_id: "r1",
  run_started_at: "2026-01-01T00:00:00+00:00",
  run_ended_at: "2026-01-01T00:00:01+00:00",
  code_version: "deadbeef",
  config_snapshot: {
    strategy: {
      enabled_setup: "vwap_pullback_long",
      opening_range: { minutes: 15 },
      vwap_pullback: {
        max_distance_from_vwap_pct: 0.25,
        stop: { buffer_pct: 0.05 },
        target: { risk_reward: 2.0 },
      },
    },
    risk: {
      account_value: 25000,
      max_risk_per_trade_pct: 0.1,
      max_position_value_pct: 100,
      max_consecutive_losses: 2,
    },
  },
  data_fingerprint: {
    sha256: "abcd1234",
    bar_count: 234,
    earliest_timestamp: "x",
    latest_timestamp: "y",
    session_count: 3,
  },
  summary: {
    total_trades: 0,
    wins: 0,
    losses: 0,
    win_rate: 0,
    average_win_r: 0,
    average_loss_r: 0,
    average_r: 0,
    total_r: 0,
    profit_factor: null,
    max_drawdown_r: 0,
    best_trade_r: null,
    worst_trade_r: null,
    longest_consecutive_loss_streak: 0,
    rejected_signal_count: 0,
    rejection_breakdown: {},
  },
};

describe("StrategyConfigCard", () => {
  it("renders the strategy and risk config from the manifest snapshot", () => {
    render(<StrategyConfigCard manifest={baseManifest} />);
    expect(screen.getByText(/VWAP Pullback Long/i)).toBeInTheDocument();
    expect(screen.getByText(/\$25,000/)).toBeInTheDocument();
    expect(screen.getByText("0.1%")).toBeInTheDocument(); // risk per trade
    expect(screen.getByText("100%")).toBeInTheDocument(); // position cap
    expect(screen.getByText("2.0")).toBeInTheDocument(); // risk:reward
    expect(screen.getByText("15 min")).toBeInTheDocument(); // OR minutes
    expect(screen.getByText("0.05%")).toBeInTheDocument(); // stop buffer
    expect(screen.getByText("0.25%")).toBeInTheDocument(); // max distance from VWAP
  });

  it("falls back to em-dash when the config snapshot is empty", () => {
    const empty: RunManifestView = {
      ...baseManifest,
      config_snapshot: {},
    };
    render(<StrategyConfigCard manifest={empty} />);
    // 9 fields × "—" each (label/value rendered for every row).
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(9);
  });
});
