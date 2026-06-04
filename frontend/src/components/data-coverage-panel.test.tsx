import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mutate = vi.fn()
let coverageData: unknown
let statusData: unknown
let statsData: unknown
let jobsData: unknown

vi.mock('@/hooks/useBarsCoverage', () => ({
  useBarsCoverage: () => ({ data: coverageData, isLoading: false }),
}))
vi.mock('@/hooks/useStartBackfill', () => ({
  useStartBackfill: () => ({ mutate, isPending: false, isError: false, error: null }),
}))
vi.mock('@/hooks/useBackfillStatus', () => ({
  useBackfillStatus: () => ({ data: statusData }),
}))
// Feature 013: stats + job-history hooks (sections render only with data).
vi.mock('@/hooks/useBarsStats', () => ({
  useBarsStats: () => ({ data: statsData, isError: false }),
}))
vi.mock('@/hooks/useBackfillJobs', () => ({
  useBackfillJobs: () => ({ data: jobsData, isError: false }),
}))

import { DataCoveragePanel } from './data-coverage-panel'

const REGIMES = [
  { name: '2020 volatility', start: '2020-01-01', end: '2020-12-31', expected_sessions: 253, present_sessions: 250, completeness_pct: 98.8, covered: true },
  { name: '2022 bear', start: '2022-01-01', end: '2022-12-31', expected_sessions: 251, present_sessions: 120, completeness_pct: 47.8, covered: false },
]

describe('DataCoveragePanel', () => {
  beforeEach(() => {
    mutate.mockReset()
    coverageData = { earliest: '2020-01-02', latest: '2026-06-01', regimes: REGIMES }
    statusData = undefined
    statsData = undefined
    jobsData = undefined
  })

  it('renders the Feature 013 sections when stats are available', () => {
    statsData = {
      totals: { bars: 100, sessions: 2, earliest: '2026-05-01', latest: '2026-05-04', last_updated: '2026-05-04T20:00:00Z', sources: ['alpaca'] },
      months: [
        { month: '2026-05', state: 'complete', sessions_present: 2, sessions_expected: 2, bars: 100, sources: ['alpaca'], missing_dates: [] },
      ],
      lineage: { runs_count: 1, studies_count: 0, latest_run_at: null },
    }
    jobsData = { jobs: [] }
    render(<DataCoveragePanel />)
    expect(screen.getByTestId('cache-summary')).toBeInTheDocument()
    expect(screen.getByTestId('cache-heatmap')).toBeInTheDocument()
    expect(screen.getByTestId('job-history')).toBeInTheDocument()
    // The new concepts ship tooltips (constitution VI).
    for (const key of ['cache_heatmap', 'backfill_job_history', 'data_lineage']) {
      expect(document.querySelector(`[data-help-key="${key}"]`)).toBeTruthy()
    }
  })

  it('renders the cached span', () => {
    render(<DataCoveragePanel />)
    expect(screen.getByTestId('coverage-span').textContent).toContain('2020-01-02')
    expect(screen.getByTestId('coverage-span').textContent).toContain('2026-06-01')
  })

  it('renders a row per regime with covered/gap status', () => {
    render(<DataCoveragePanel />)
    expect(screen.getByTestId('regime-status-2020 volatility').textContent).toBe('covered')
    // A <90% regime is flagged as a gap.
    expect(screen.getByTestId('regime-status-2022 bear').textContent).toBe('gap')
  })

  it('shows educational HelpTooltips for the new concepts', () => {
    render(<DataCoveragePanel />)
    const dots = document.querySelectorAll('.info-dot')
    // data_coverage + regime_completeness + backfill + data_source
    expect(dots.length).toBeGreaterThanOrEqual(4)
  })

  it('triggers a backfill when the button is clicked', () => {
    render(<DataCoveragePanel />)
    fireEvent.click(screen.getByTestId('backfill-start-btn'))
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0][0]).toMatchObject({ source: 'alpaca' })
  })

  it('shows progress when a job is in flight', () => {
    statusData = { job_id: 'j1', status: 'running', source: 'alpaca', range_start: '2018-01-01', range_end: '2026-06-01', windows_total: 100, windows_done: 40, bars_added: 180000, gap_session_dates: [], failure_reason: null }
    render(<DataCoveragePanel />)
    expect(screen.getByTestId('backfill-progress').textContent).toContain('40/100')
  })

  it('handles empty coverage gracefully', () => {
    coverageData = { earliest: null, latest: null, regimes: [] }
    render(<DataCoveragePanel />)
    expect(screen.getByTestId('coverage-span').textContent).toContain('No bars cached')
  })
})
