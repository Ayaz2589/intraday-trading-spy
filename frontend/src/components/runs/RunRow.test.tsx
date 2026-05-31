import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Run } from '@/api/types'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
}))

const baseRun: Run = {
  id: 'r1',
  started_at: '2026-05-31T13:30:00Z',
  finished_at: '2026-05-31T13:35:00Z',
  status: 'finished',
  range_start: '2026-05-30',
  range_end: '2026-05-31',
  bar_count: 78,
  summary: {
    pnl: '$120.50',
    win_rate: 0.6,
    sharpe: 1.5,
    max_drawdown: '$50.00',
    total_trades: 5,
    total_signals: 10,
    rejected_signals: 5,
  },
  data_fingerprint: 'fp123',
  app_version: '0.1.0',
}

describe('<RunRow />', () => {
  it('renders run status with correct data attribute', async () => {
    const { RunRow } = await import('./RunRow')
    render(<RunRow run={baseRun} />)
    expect(screen.getByTestId('run-row-status')).toHaveAttribute('data-status', 'finished')
  })

  it('shows failure_reason inline when status=failed', async () => {
    const { RunRow } = await import('./RunRow')
    const failed = { ...baseRun, id: 'r2', status: 'failed' as const }
    render(<RunRow run={failed} failureReason="data fetch error" />)
    expect(screen.getByTestId('run-row-failure-reason')).toHaveTextContent('data fetch error')
  })

  it('does not render failure_reason when status is not failed', async () => {
    const { RunRow } = await import('./RunRow')
    render(<RunRow run={baseRun} failureReason="should not show" />)
    expect(screen.queryByTestId('run-row-failure-reason')).toBeNull()
  })
})
