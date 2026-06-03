export type JournalRowView = {
  row_seq: number;
  timestamp: string;
  status:
    | "emitted"
    | "approved"
    | "rejected"
    | "executed"
    | "exited"
    | "force_flat"
    | "lockout";
  setup: string | null;
  direction: "long" | null;
  planned_entry: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  quantity: number | null;
  planned_risk_dollars: number | null;
  actual_entry: number | null;
  actual_exit: number | null;
  exit_reason: "stop" | "target" | "force_flat" | null;
  realized_pnl: number | null;
  realized_r: number | null;
  vwap: number | null;
  or_high: number | null;
  or_low: number | null;
  distance_from_vwap_pct: number | null;
  prior_bar_close: number | null;
  reason: string;
  rejection_check: string | null;
  same_bar_tiebreak: "none" | "stop_first" | null;
};

// Feature 010 (honest backtest): equity-curve + per-bucket value objects.
export type EquityPointView = {
  timestamp: string | null;
  equity: number;
  cumulative_net_pnl: number;
};

export type BucketView = {
  key: string;
  trade_count: number;
  net_pnl_dollars: number;
  win_rate: number | null;
  expectancy_r: number | null;
};

export type SummaryMetricsView = {
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  average_win_r: number;
  average_loss_r: number;
  average_r: number;
  total_r: number;
  profit_factor: number | null;
  max_drawdown_r: number;
  best_trade_r: number | null;
  worst_trade_r: number | null;
  longest_consecutive_loss_streak: number;
  rejected_signal_count: number;
  rejection_breakdown: Record<string, number>;
  // Feature 010 — optional so pre-010 runs still type-check.
  total_pnl_dollars?: number;
  total_net_pnl_dollars?: number;
  total_fees_dollars?: number;
  total_slippage_dollars?: number;
  expectancy_r?: number | null;
  expectancy_dollars?: number | null;
  sharpe?: number | null;
  sortino?: number | null;
  max_drawdown_dollars?: number;
  max_drawdown_pct?: number | null;
  return_median_dollars?: number | null;
  return_std_dollars?: number | null;
  return_skew?: number | null;
  win_rate_ci_low?: number | null;
  win_rate_ci_high?: number | null;
  low_confidence?: boolean;
  equity_curve?: EquityPointView[];
  hour_buckets?: BucketView[];
  weekday_buckets?: BucketView[];
  month_buckets?: BucketView[];
};

export type RunSummaryView = {
  run_id: string;
  started_at: string;
  summary: SummaryMetricsView;
};

export type BarView = {
  symbol: "SPY";
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type RunManifestView = {
  run_id: string;
  run_started_at: string;
  run_ended_at: string;
  code_version: string;
  config_snapshot: Record<string, unknown>;
  data_fingerprint: {
    sha256: string;
    bar_count: number;
    earliest_timestamp: string;
    latest_timestamp: string;
    session_count: number;
  };
  summary: SummaryMetricsView;
};

export type JournalFilter =
  | "all"
  | "executed"
  | "exited"
  | "rejected"
  | "lockout"
  | "force_flat";
