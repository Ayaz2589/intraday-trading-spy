import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { Run } from '@/api/types'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
  useNavigate: () => vi.fn(),
}))

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

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
  is_favorite: false,
  failure_reason: null,
}

describe('<RunRow />', () => {
  it('renders run status with correct data attribute', async () => {
    const { RunRow } = await import('./RunRow')
    render(wrap(<RunRow run={baseRun} />))
    expect(screen.getByTestId('run-row-status')).toHaveAttribute('data-status', 'finished')
  })

  it('shows failure_reason inline when status=failed', async () => {
    const { RunRow } = await import('./RunRow')
    const failed = { ...baseRun, id: 'r2', status: 'failed' as const }
    render(wrap(<RunRow run={failed} failureReason="data fetch error" />))
    expect(screen.getByTestId('run-row-failure-reason')).toHaveTextContent('data fetch error')
  })

  it('does not render failure_reason when status is not failed', async () => {
    const { RunRow } = await import('./RunRow')
    render(wrap(<RunRow run={baseRun} failureReason="should not show" />))
    expect(screen.queryByTestId('run-row-failure-reason')).toBeNull()
  })

  it('shows the origin badge for a study child run', async () => {
    const { RunRow } = await import('./RunRow')
    const child = {
      ...baseRun,
      id: 'r3',
      study_id: 's1',
      study_kind: 'walk_forward' as const,
      segment: 'validation' as const,
      window_index: 9,
    }
    render(wrap(<RunRow run={child} />))
    expect(screen.getByTestId('run-origin-badge')).toHaveTextContent('walk-forward · OOS · w9')
  })

  it('shows CLI run origin for a standalone run', async () => {
    const { RunRow } = await import('./RunRow')
    render(wrap(<RunRow run={baseRun} />))
    expect(screen.getByTestId('run-origin-badge')).toHaveTextContent('CLI run')
  })
})

describe('<RunRow /> — numeric cells (backtests-page polish)', () => {
  it('renders bare right-aligned numbers without word prefixes', async () => {
    const { RunRow } = await import('./RunRow')
    render(wrap(<RunRow run={baseRun} />))
    expect(screen.getByTestId('run-row-trades')).toHaveTextContent(/^5$/)
    const pnl = screen.getByTestId('run-row-pnl')
    expect(pnl).toHaveTextContent(/^\$120\.50$/)
    expect(pnl).toHaveAttribute('data-sign', 'pos')
  })

  it('marks negative PnL as a loss', async () => {
    const { RunRow } = await import('./RunRow')
    const losing = { ...baseRun, id: 'r9', summary: { ...baseRun.summary, pnl: '-$42.10' } }
    render(wrap(<RunRow run={losing} />))
    expect(screen.getByTestId('run-row-pnl')).toHaveAttribute('data-sign', 'neg')
  })
})
