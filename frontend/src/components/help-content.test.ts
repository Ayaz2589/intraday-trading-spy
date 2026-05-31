import { describe, expect, it } from "vitest";
import { HELP_CONTENT, type HelpContentKey } from "./help-content";

describe("HELP_CONTENT", () => {
  it("has every HelpContentKey covered (16 Feature 004 + 12 Feature 007 = 28 concepts)", () => {
    const expected: HelpContentKey[] = [
      // Feature 004
      "vwap",
      "opening_range",
      "r_multiple",
      "profit_factor",
      "max_drawdown",
      "win_rate",
      "rejected_signal",
      "position_cap",
      "cooldown",
      "lockout",
      "force_flat_exit",
      "take_profit",
      "stop_loss",
      "risk_per_trade",
      "layout_mode",
      "show_rejections",
      // Feature 007
      "mfa",
      "totp",
      "otp",
      "backup_codes",
      "session",
      "saved_config",
      "strategy_registry",
      "backtest_queue",
      "run_status",
      "cloud_push",
      "data_download_job",
      "connection_status",
    ];
    for (const key of expected) {
      expect(HELP_CONTENT[key]).toBeDefined();
      expect(HELP_CONTENT[key].title.length).toBeGreaterThan(0);
      expect(HELP_CONTENT[key].description.length).toBeGreaterThan(20);
    }
    expect(Object.keys(HELP_CONTENT).length).toBe(expected.length);
  });
});
