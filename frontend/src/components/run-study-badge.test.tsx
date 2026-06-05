// T016 (Feature 014, FR-009) — study-membership badge on the run detail page.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RunStudyBadge } from './run-study-badge'
import type { Run } from '@/api/types'

function run(over: Partial<Run> = {}): Run {
  return {
    id: 'r1',
    started_at: '2026-06-04T14:00:00Z',
    finished_at: '2026-06-04T14:01:00Z',
    status: 'finished',
    range_start: '2019-01-02',
    range_end: '2019-03-29',
    bar_count: 100,
    summary: {
      pnl: 0, win_rate: 0.5, sharpe: 0, max_drawdown: 0,
      total_trades: 3, total_signals: 10, rejected_signals: 7,
    } as Run['summary'],
    data_fingerprint: 'fp',
    app_version: 'test',
    is_favorite: false,
    failure_reason: null,
    ...over,
  }
}

describe('RunStudyBadge', () => {
  it('renders nothing for a standalone run', () => {
    render(<RunStudyBadge run={run()} />)
    expect(screen.queryByTestId('run-study-badge')).not.toBeInTheDocument()
  })

  it('shows study membership with window + segment and links back to the study', () => {
    render(<RunStudyBadge run={run({ study_id: 'st-9', segment: 'validation', window_index: 3 })} />)
    const badge = screen.getByTestId('run-study-badge')
    expect(badge.textContent).toMatch(/part of study/i)
    expect(badge.textContent).toContain('window 3')
    expect(badge.textContent).toContain('validation')
    expect(screen.getByRole('link', { name: /view study/i })).toHaveAttribute('href', '/validation/st-9')
  })

  it('omits the window label when window_index is null (lockbox-style children)', () => {
    render(<RunStudyBadge run={run({ study_id: 'st-9', segment: 'lockbox', window_index: null })} />)
    const badge = screen.getByTestId('run-study-badge')
    expect(badge.textContent).not.toMatch(/window/i)
    expect(badge.textContent).toContain('lockbox')
  })

  it('ships the child-run help tooltip (constitution VI)', () => {
    render(<RunStudyBadge run={run({ study_id: 'st-9', segment: 'train', window_index: 0 })} />)
    expect(screen.getByLabelText(/help: child run/i)).toBeInTheDocument()
  })
})
