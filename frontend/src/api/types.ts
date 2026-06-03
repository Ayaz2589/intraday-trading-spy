/**
 * Response types matching Feature 006's contracts/endpoints.md.
 *
 * NOTE: Constitution V — `live_auto_enabled` is deliberately NOT in any
 * response type. The backend doesn't include it; the UI can't render it.
 *
 * Legacy types from Feature 003/004 (RunSummaryView, JournalRowView,
 * BarView, RunManifestView, etc.) live in `legacy-types.ts` until the
 * pre-feature components are migrated.
 */

export type UUID = string

export type RunStatus = 'queued' | 'running' | 'finished' | 'failed'

export type RunSummary = {
  pnl: string
  win_rate: number
  sharpe: number
  max_drawdown: string // legacy R units (Feature 010 / I1)
  total_trades: number
  total_signals: number
  rejected_signals: number
  // Feature 010 — optional so pre-010 rows still type-check.
  sortino?: number
  expectancy?: number
  expectancy_dollars?: string
  max_drawdown_dollars?: string
  max_drawdown_pct?: number
  total_fees?: string
  total_slippage?: string
  low_confidence?: boolean
  win_rate_ci_low?: number
  win_rate_ci_high?: number
}

export type Run = {
  id: UUID
  started_at: string
  finished_at: string
  status: RunStatus
  range_start: string
  range_end: string
  bar_count: number
  summary: RunSummary
  data_fingerprint: string
  app_version: string
  is_favorite: boolean
  failure_reason: string | null
}

export type RunListResponse = { runs: Run[]; next_cursor: string | null }
export type RunStatusResponse = {
  status: RunStatus
  status_updated_at: string
  failure_reason: string | null
}

export type Trade = {
  id: UUID
  direction: 'LONG'
  quantity: string
  entry_at: string
  entry_price: string
  stop_price: string
  target_price: string
  exit_at: string
  exit_price: string
  exit_reason: 'target' | 'stop' | 'force_flat' | 'timeout' | 'other'
  pnl: string
  r_multiple: string
}

export type TradeListResponse = { trades: Trade[]; next_cursor: string | null }

export type Signal = {
  id: UUID
  emitted_at: string
  direction: 'LONG'
  entry_price: string
  stop_price: string | null
  target_price: string | null
  executed: boolean
  rejection_reason: string | null
  trade_id: UUID | null
  indicator_context: Record<string, unknown>
  reason_text: string
}

export type SignalListResponse = { signals: Signal[]; next_cursor: string | null }

export type JournalEvent = {
  id: UUID
  occurred_at: string
  kind: string
  severity: 'info' | 'warning' | 'error'
  message: string
  details: Record<string, unknown>
}

export type JournalListResponse = { events: JournalEvent[]; next_cursor: string | null }

export type Bar = {
  symbol: 'SPY'
  timestamp: string
  open: string
  high: string
  low: string
  close: string
  volume: number
}

export type BarListResponse = { bars: Bar[] }

export type Strategy = {
  key: string
  display_name: string
  description: string
  symbol: 'SPY'
  direction: 'LONG'
  kind: 'rule_based'
  enabled: boolean
}

export type StrategyListResponse = { strategies: Strategy[] }

export type Config = {
  id: UUID
  name: string
  mode: 'backtest' | 'paper'
  timeframe: '5m'
  strategy_id: UUID
  params: Record<string, unknown>
}

export type RunManifestResponse = {
  strategy: Strategy
  config: Config
}

export type StartBacktestRequest = {
  config_name: string
  data_csv_path?: string
  start_date?: string // YYYY-MM-DD
  end_date?: string // YYYY-MM-DD
}
export type StartBacktestResponse = { run_id: UUID; status: 'queued' }

export type StartDataDownloadRequest = { start_date: string; end_date: string }
export type StartDataDownloadResponse = { job_id: UUID; status: 'queued' }

export type DataDownloadJob = {
  id: UUID
  start_date: string
  end_date: string
  status: RunStatus
  storage_path: string | null
  status_updated_at: string
  failure_reason: string | null
}

export type HealthResponse = { status: 'ok'; db: 'ok' | 'unreachable' }

export type ApiErrorBody = {
  error: string
  message: string
  [key: string]: unknown
}
