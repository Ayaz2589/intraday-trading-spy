import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

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

  it('renders the redesigned sections when stats are available', () => {
    statsData = {
      totals: { bars: 100, sessions: 2, earliest: '2026-05-01', latest: '2026-05-04', last_updated: '2026-05-04T20:00:00Z', sources: ['alpaca'] },
      months: [
        { month: '2026-05', state: 'complete', sessions_present: 2, sessions_expected: 2, bars: 100, sources: ['alpaca'], missing_dates: [] },
      ],
      lineage: { runs_count: 1, studies_count: 0, latest_run_at: null },
    }
    jobsData = { jobs: [] }
    render(<DataCoveragePanel />)
    expect(screen.getByTestId('stat-cards')).toBeInTheDocument()
    expect(screen.getByTestId('status-strip')).toBeInTheDocument()
    expect(screen.getByTestId('cache-bar-chart')).toBeInTheDocument()
    expect(screen.getByTestId('job-history')).toBeInTheDocument()
    expect(screen.getByTestId('backfill-estimate')).toBeInTheDocument()
    // Concepts keep their tooltips (constitution VI).
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

  it('shows prominent progress with a spinner when a job is in flight', () => {
    statusData = { job_id: 'j1', status: 'running', source: 'alpaca', range_start: '2018-01-01', range_end: '2026-06-01', windows_total: 100, windows_done: 40, bars_added: 180000, gap_session_dates: [], failure_reason: null }
    render(<DataCoveragePanel />)
    const panel = screen.getByTestId('backfill-progress')
    expect(panel.textContent).toContain('40/100')
    expect(panel.textContent).toContain('40%')
    expect(panel.textContent).toContain('180,000')
    expect(screen.getByTestId('backfill-spinner')).toBeInTheDocument()
  })

  it('shows a success panel without a spinner when the job finishes', () => {
    statusData = { job_id: 'j1', status: 'finished', source: 'alpaca', range_start: '2018-01-01', range_end: '2026-06-01', windows_total: 100, windows_done: 100, bars_added: 92, gap_session_dates: [], failure_reason: null }
    render(<DataCoveragePanel />)
    const panel = screen.getByTestId('backfill-progress')
    expect(panel.textContent).toMatch(/complete/i)
    expect(panel.textContent).toContain('+92')
    expect(screen.queryByTestId('backfill-spinner')).not.toBeInTheDocument()
  })

  it('auto-dismisses the success panel after a few seconds', () => {
    vi.useFakeTimers()
    try {
      statusData = { job_id: 'j1', status: 'finished', source: 'alpaca', range_start: '2018-01-01', range_end: '2026-06-01', windows_total: 100, windows_done: 100, bars_added: 92, gap_session_dates: [], failure_reason: null }
      render(<DataCoveragePanel />)
      expect(screen.getByTestId('backfill-progress')).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(7000)
      })
      expect(screen.queryByTestId('backfill-progress')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('failed panel stays until manually dismissed', () => {
    vi.useFakeTimers()
    try {
      statusData = { job_id: 'j1', status: 'failed', source: 'alpaca', range_start: '2018-01-01', range_end: '2026-06-01', windows_total: 100, windows_done: 0, bars_added: 0, gap_session_dates: [], failure_reason: 'boom' }
      render(<DataCoveragePanel />)
      act(() => {
        vi.advanceTimersByTime(60000)
      })
      expect(screen.getByTestId('backfill-progress')).toBeInTheDocument() // no auto-dismiss
      fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
      expect(screen.queryByTestId('backfill-progress')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows a failure panel when the job fails', () => {
    statusData = { job_id: 'j1', status: 'failed', source: 'alpaca', range_start: '2018-01-01', range_end: '2026-06-01', windows_total: 100, windows_done: 0, bars_added: 0, gap_session_dates: [], failure_reason: 'boom' }
    render(<DataCoveragePanel />)
    const panel = screen.getByTestId('backfill-progress')
    expect(panel.textContent).toMatch(/failed/i)
    expect(panel.textContent).toContain('boom')
    expect(screen.queryByTestId('backfill-spinner')).not.toBeInTheDocument()
  })

  it('handles empty coverage gracefully', () => {
    coverageData = { earliest: null, latest: null, regimes: [] }
    render(<DataCoveragePanel />)
    expect(screen.getByTestId('coverage-span').textContent).toContain('No bars cached')
  })
})
