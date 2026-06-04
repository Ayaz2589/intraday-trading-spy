import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { JobHistoryTable } from './JobHistoryTable'
import type { BackfillJobView } from '@/api/bars'

// T006 (Feature 013 US1): the job-history table — newest first, duration,
// failure reason discoverable, running rows show live progress.

const base: BackfillJobView = {
  job_id: 'job-finished',
  status: 'finished',
  source: 'alpaca',
  range_start: '2018-01-01',
  range_end: '2026-06-04',
  windows_total: 103,
  windows_done: 103,
  bars_added: 1,
  gap_session_dates: [],
  failure_reason: null,
  created_at: '2026-06-04T14:46:02Z',
  updated_at: '2026-06-04T14:46:50Z',
}

const failed: BackfillJobView = {
  ...base,
  job_id: 'job-failed',
  status: 'failed',
  windows_done: 0,
  bars_added: 0,
  failure_reason: "No module named 'alpaca'",
  created_at: '2026-06-04T14:31:10Z',
  updated_at: '2026-06-04T14:31:11Z',
}

describe('JobHistoryTable', () => {
  it('renders jobs in given order with range, windows, bars and duration', () => {
    render(<JobHistoryTable jobs={[base, failed]} />)
    const rows = screen.getAllByTestId(/job-row-/)
    expect(rows[0]).toHaveAttribute('data-testid', 'job-row-job-finished')
    expect(rows[1]).toHaveAttribute('data-testid', 'job-row-job-failed')
    expect(rows[0].textContent).toContain('2018-01-01 → 2026-06-04')
    expect(rows[0].textContent).toContain('103/103')
    expect(rows[0].textContent).toContain('48s') // duration = updated − created
  })

  it('keeps a failed job visible with its failure reason (FR-002)', () => {
    render(<JobHistoryTable jobs={[base, failed]} />)
    expect(screen.getByTitle("No module named 'alpaca'")).toBeInTheDocument()
    expect(screen.getByTestId('job-row-job-failed').textContent).toContain('failed')
  })

  it('shows a running job as in progress without a duration', () => {
    const running = { ...base, job_id: 'job-running', status: 'running' as const, windows_done: 12, updated_at: null }
    render(<JobHistoryTable jobs={[running]} />)
    const row = screen.getByTestId('job-row-job-running')
    expect(row.textContent).toContain('running')
    expect(row.textContent).toContain('12/103')
    expect(row.textContent).not.toContain('NaN')
  })

  it('renders an empty state when there are no jobs', () => {
    render(<JobHistoryTable jobs={[]} />)
    expect(screen.getByText(/no backfills yet/i)).toBeInTheDocument()
  })
})
