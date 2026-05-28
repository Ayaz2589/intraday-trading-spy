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
