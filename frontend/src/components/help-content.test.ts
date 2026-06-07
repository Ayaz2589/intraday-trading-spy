import { describe, expect, it } from "vitest";
import { HELP_CONTENT, type HelpContentKey } from "./help-content";

describe("HELP_CONTENT", () => {
  it("has every HelpContentKey covered (16 F004 + 9 F007 + 4 F009 + 12 F010 + 10 F011 + 4 F012 + 3 F013 + 3 F014 + 9 F015 + 7 F016 + 1 F017 + 5 F018 + 5 F019 + 1 F020 + 10 F021 = 99 concepts)", () => {
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
      "otp",
      "session",
      "saved_config",
      "strategy_registry",
      "backtest_queue",
      "run_status",
      "cloud_push",
      "data_download_job",
      "connection_status",
      // Feature 009
      "data_coverage",
      "regime_completeness",
      "backfill",
      "data_source",
      // Feature 010 (honest backtest)
      "slippage",
      "fees",
      "expectancy",
      "sharpe",
      "sortino",
      "drawdown_money",
      "drawdown_pct",
      "return_distribution",
      "equity_curve",
      "per_bucket",
      "confidence_interval",
      "sample_size",
      // Feature 011 (validation engine)
      "walk_forward",
      "in_sample",
      "out_of_sample",
      "is_oos_gap",
      "parameter_sensitivity",
      "plateau_vs_peak",
      "bootstrap_ci",
      "permutation_test",
      "lockbox",
      "burned_lockbox",
      // Feature 012 (config management)
      "active_config",
      "duplicate_vs_edit",
      "delete_safe",
      "buying_power",
      // Feature 013 (data observability)
      "cache_heatmap",
      "backfill_job_history",
      "data_lineage",
      // Feature 014 (study child-run persistence + drill-down)
      "child_run",
      "study_drilldown",
      "rerun_study",
      // Feature 015 (Monte Carlo path-risk)
      "monte_carlo_simulation",
      "shuffle_method",
      "max_drawdown_distribution",
      "losing_streak",
      "underwater_period",
      "mc_iterations_seed",
      "forward_cone",
      "risk_of_ruin",
      "mc_in_sample_caveat",
      // Feature 016 (pooled gate)
      "pooled_gate",
      "sign_test",
      "fisher_combined",
      "edge_timeseries",
      "window_distribution",
      "claude_advisory",
      "snapshot_pin",
      // Feature 017
      "claude_experiment_draft",
      // Feature 018 (recommendation engine)
      "health_verdict",
      "recommendation_classes",
      "evidence_pack",
      "trial_count",
      // Feature 018.1 (factory reset)
      "delete_all_data",
      // Feature 019 (auto-research campaigns)
      "auto_research_campaign",
      "trial_budget",
      "tightened_bar",
      "stopping_rules",
      "ready_for_lockbox",
      // Feature 020 (entry-window filter)
      "entry_window",
      // Feature 021 (live paper trading)
      "automation_session",
      "armed_session",
      "paper_account",
      "sizing_account_value",
      "protective_orders",
      "reconcile_drift",
      "stale_data_pause",
      "forward_record",
      "manual_order",
      "live_journal",
    ];
    for (const key of expected) {
      expect(HELP_CONTENT[key]).toBeDefined();
      expect(HELP_CONTENT[key].title.length).toBeGreaterThan(0);
      expect(HELP_CONTENT[key].description.length).toBeGreaterThan(20);
    }
    expect(Object.keys(HELP_CONTENT).length).toBe(expected.length);
  });
});
