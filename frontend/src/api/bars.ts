import { apiRequest } from './client'

export type BarsFetchRequest = {
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD
  timeframe?: '5m' | '1m'
}

export type BarsFetchResponse = {
  inserted: number
  start: string
  end: string
}

// Feature 009: per-regime data coverage.
export type RegimeCoverage = {
  name: string
  start: string // YYYY-MM-DD
  end: string
  expected_sessions: number
  present_sessions: number
  completeness_pct: number
  covered: boolean
}

export type BarsCoverageResponse = {
  earliest: string | null // YYYY-MM-DD
  latest: string | null
  regimes: RegimeCoverage[]
}

// Feature 009: bulk historical backfill.
export type StartBackfillRequest = {
  start: string // YYYY-MM-DD
  end: string
  source?: string // default 'alpaca'
}

export type StartBackfillResponse = {
  job_id: string
  status: string
}

export type BackfillJobView = {
  job_id: string
  status: 'queued' | 'running' | 'finished' | 'failed'
  source: string
  range_start: string
  range_end: string
  windows_total: number
  windows_done: number
  bars_added: number
  gap_session_dates: string[]
  failure_reason: string | null
  // Feature 013: when the job ran + (with updated_at) how long it took.
  created_at: string | null
  updated_at: string | null
}

// ---- Feature 013: data observability ----

export type BackfillJobListResponse = { jobs: BackfillJobView[] }

export type CacheTotals = {
  bars: number
  sessions: number
  earliest: string | null // YYYY-MM-DD
  latest: string | null
  last_updated: string | null
  sources: string[]
}

export type MonthState = 'complete' | 'partial' | 'current' | 'future'

export type MonthStat = {
  month: string // "YYYY-MM"
  state: MonthState
  sessions_present: number
  sessions_expected: number
  bars: number
  sources: string[]
  missing_dates: string[] // non-empty iff state === 'partial'
}

export type Lineage = {
  runs_count: number
  studies_count: number
  latest_run_at: string | null
}

export type BarsStatsResponse = {
  totals: CacheTotals
  months: MonthStat[]
  lineage: Lineage
}

export function fetchBarsRange(body: BarsFetchRequest): Promise<BarsFetchResponse> {
  return apiRequest<BarsFetchResponse>('/api/bars/fetch', { method: 'POST', body })
}

export function getBarsCoverage(): Promise<BarsCoverageResponse> {
  return apiRequest<BarsCoverageResponse>('/api/bars/coverage')
}

export function startBackfill(body: StartBackfillRequest): Promise<StartBackfillResponse> {
  return apiRequest<StartBackfillResponse>('/api/bars/backfill', { method: 'POST', body })
}

export function getBackfillStatus(jobId: string): Promise<BackfillJobView> {
  return apiRequest<BackfillJobView>(`/api/bars/backfill/${jobId}`)
}

export function listBackfillJobs(): Promise<BackfillJobListResponse> {
  return apiRequest<BackfillJobListResponse>('/api/bars/backfill')
}

export function getBarsStats(): Promise<BarsStatsResponse> {
  return apiRequest<BarsStatsResponse>('/api/bars/stats')
}
