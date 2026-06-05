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
  // Feature 014 (FR-009): study membership for child runs; null/absent for
  // standalone runs. segment is null for combined train+validation children.
  study_id?: UUID | null
  segment?: 'train' | 'validation' | 'lockbox' | null
  window_index?: number | null
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
  // Feature 012 — exactly one config per user is the active one (pre-selected
  // in every picker). Optional so pre-012 cached shapes still type-check.
  is_active?: boolean
}

// Feature 012 — built-in preset a config can be created from. Read-only
// templates surfaced by GET /api/configs/presets; not user-editable themselves.
export type Preset = {
  name: string
  description: string
  params: Record<string, unknown>
}

export type ConfigSource = 'scratch' | 'preset' | 'duplicate'

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

// ---- Feature 011: validation engine ----

export type StudyKind = 'walk_forward' | 'sensitivity'

export type WindowMetrics = {
  segment: 'train' | 'validation' | 'lockbox'
  range_start: string
  range_end: string
  run_id: string
  // Feature 014 (FR-007): true when run_id refers to a stored, drillable run.
  // Absent in pre-014 stored results — treat missing as false.
  persisted?: boolean
  total_trades: number
  expectancy_dollars: number | null
  expectancy_r: number | null
  win_rate: number
  profit_factor: number | null
  sharpe: number | null
  total_net_pnl_dollars: number
  low_confidence: boolean
}

export type WalkForwardWindowResult = {
  window_index: number
  in_sample: WindowMetrics
  out_of_sample: WindowMetrics
  gap: Record<string, number | null>
}

export type WalkForwardResult = {
  // Feature 016: the persisted pooled gate (additive key).
  pooled_gate?: PooledGateResult | null
  mode: 'rolling' | 'anchored'
  train_months: number
  step_months: number
  validation_months: number
  windows: WalkForwardWindowResult[]
  mean_oos: Record<string, number | null>
  mean_gap: Record<string, number | null>
}

export type SensitivityPoint = {
  coords: Record<string, number>
  metric: number | null
  trade_count: number
  low_confidence: boolean
  run_id: string
  // Feature 014 (FR-007): same drillability semantics as WindowMetrics.
  persisted?: boolean
}

export type SensitivitySurface = {
  metric_name: string
  knobs: string[]
  axes: Record<string, number[]>
  points: SensitivityPoint[]
  segment: 'train' | 'validation' | 'train_validation'
}

export type BootstrapCI = {
  statistic: string
  point: number | null
  low: number | null
  high: number | null
}

export type SignificanceResult = {
  confidence: number
  bootstrap: BootstrapCI[]
  permutation_metric: string
  observed: number
  p_value: number | null
  alpha: number
  significant: boolean
  bootstrap_iterations: number
  permutation_iterations: number
  seed: number
}

export type ValidationStudy = {
  id: UUID
  kind: StudyKind
  status: RunStatus
  progress_completed: number
  progress_total: number
  result: WalkForwardResult | SensitivitySurface | Record<string, unknown> | null
  failure_reason: string | null
  created_at: string
  // Validation-page redesign: which config the study tested (from launch
  // params). Optional so pre-redesign cached shapes still type-check.
  config_name?: string | null
}

export type StudyListResponse = { studies: ValidationStudy[]; next_cursor: string | null }

export type ValidationStudyStatus = {
  id: UUID
  status: RunStatus
  progress_completed: number
  progress_total: number
  failure_reason: string | null
}

export type StartStudyRequest = {
  kind: StudyKind
  config_name: string
  walk_forward?: Record<string, unknown>
  grid?: Array<{ knob: string; values: number[] }>
  metric?: string
  segment?: 'train' | 'validation' | 'train_validation'
  confirm_large?: boolean
}
export type StartStudyResponse = { study_id: UUID; status: 'queued'; planned_evaluations: number }

// Feature 014 (FR-010): the NEW study created by cloning an existing one.
export type StudyRerunResponse = { study_id: UUID; planned_evaluations: number }

export type SignificanceRequest = { run_id: UUID }

// ---- Feature 015 (Monte Carlo path-risk) ----------------------------------

export type MonteCarloDistribution = {
  observed: number
  p5: number
  p25: number
  p50: number
  p75: number
  p95: number
}

export type MonteCarloShuffleStats = {
  // Drawdown pct is a FRACTION of the running peak (metrics.py convention).
  max_drawdown_pct: MonteCarloDistribution
  max_drawdown_dollars: MonteCarloDistribution
  longest_losing_streak: MonteCarloDistribution
  longest_underwater_trades: MonteCarloDistribution
}

export type MonteCarloConeStep = {
  trade_index: number
  p5: number
  p25: number
  p50: number
  p75: number
  p95: number
}

export type MonteCarloCone = {
  horizon_trades: number
  steps: MonteCarloConeStep[]
}

export type MonteCarloRuinPoint = {
  threshold_pct: number
  probability: number
}

export type MonteCarloResult = {
  shuffle: MonteCarloShuffleStats
  cone: MonteCarloCone
  // observed = the run's actual ending equity (start + sum of real PnLs).
  terminal_equity: MonteCarloDistribution
  ruin: MonteCarloRuinPoint[]
  iterations: number
  seed: number
  trade_count: number
  starting_equity: number
  low_confidence: boolean
}

export type MonteCarloRequest = { run_id: UUID }

// ---- Feature 016 (pooled study gate) ---------------------------------------

export type CIStat = { point: number | null; low: number | null; high: number | null }

export type PerWindowP = { window_index: number; p_value: number | null; significant: boolean }

export type FisherStat = { x2: number; df: number; p: number }

// ---- Feature 016 (insights aggregates) -------------------------------------

export type EdgeTimeseriesPoint = {
  run_id: string
  study_id: string
  window_index: number | null
  config_name: string | null
  range_start: string
  range_end: string
  trades: number
  net_pnl: number
  expectancy_dollars: number | null
  expectancy_r: number | null
  pnl_std: number | null
}

export type EdgeTimeseriesResponse = {
  points: EdgeTimeseriesPoint[]
  snapshot_fingerprint: string
}

export type ConfigDistributionRow = {
  config_name: string | null
  windows: number
  windows_positive: number
  pnl_q25: number | null
  pnl_q50: number | null
  pnl_q75: number | null
  expectancy_q25: number | null
  expectancy_q50: number | null
  expectancy_q75: number | null
  total_trades: number
}

export type ConfigDistributionResponse = {
  rows: ConfigDistributionRow[]
  snapshot_fingerprint: string
}

export type PooledGateResult = {
  computed_at: string | null
  mode: 'fast' | 'full'
  passed: boolean
  alpha: number
  pooled_trades: number
  windows_total: number
  windows_with_trades: number
  windows_positive: number
  total_net_pnl_dollars: number
  expectancy_dollars_ci: CIStat
  expectancy_r_ci: CIStat
  sign_test_p: number
  monte_carlo: MonteCarloResult
  per_window_p: PerWindowP[] | null
  fisher: FisherStat | null
  seed: number
}

export type LockboxState = 'unspent' | 'spent' | 'burned'
export type LockboxStatus = {
  lockbox_start: string
  lockbox_end: string
  state: LockboxState
  config_fingerprint: string | null
  run_id: UUID | null
  result: Record<string, unknown> | null
  history: Array<Record<string, unknown>>
}
export type LockboxRunRequest = { config_name: string; override?: boolean }
export type LockboxRunResponse = {
  state: 'spent' | 'burned'
  contaminated: boolean
  config_fingerprint: string
  run_id: UUID | null
  summary: Record<string, unknown>
}

export type HealthResponse = { status: 'ok'; db: 'ok' | 'unreachable' }

export type ApiErrorBody = {
  error: string
  message: string
  [key: string]: unknown
}
