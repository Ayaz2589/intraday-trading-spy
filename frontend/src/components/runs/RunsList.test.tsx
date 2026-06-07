import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Post-wipe no-data view: the Backtests page teaches where runs come from
// (validation studies) and links straight to the next step.

let queryState: Record<string, unknown>
vi.mock('@/hooks/useRuns', () => ({
  useRuns: () => queryState,
  flattenRuns: (data: unknown) =>
    (data as { pages?: { runs: unknown[] }[] } | undefined)?.pages?.flatMap(
      (p) => p.runs,
    ) ?? [],
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

import { RunsList } from './RunsList'

describe('RunsList — empty state', () => {
  it('renders the design-system empty card linking to Validation', () => {
    queryState = { data: { pages: [{ runs: [] }] }, isLoading: false, isError: false }
    render(<RunsList />)
    const empty = screen.getByTestId('runs-list-empty')
    expect(empty.querySelector('.empty-state-card')).toBeTruthy()
    expect(empty).toHaveTextContent(/no backtests yet/i)
    expect(empty).toHaveTextContent(/walk-forward/i)
    const link = empty.querySelector('a[href="/validation"]')
    expect(link).toBeTruthy()
    expect(link!).toHaveTextContent(/study/i)
    // the CLI escape hatch stays documented
    expect(empty).toHaveTextContent(/--push-to-supabase/)
  })
})

describe('RunsList — stats strip + alignment (backtests-page polish)', () => {
  // RunRow mounts useDeleteRun — these renders need a QueryClientProvider.
  const wrapQ = (ui: React.ReactElement) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
  }

  const run = (id: string, status: string, trades: number) => ({
    id,
    started_at: '2026-05-31T13:30:00Z',
    finished_at: null,
    status,
    range_start: '2026-05-30',
    range_end: '2026-05-31',
    bar_count: 78,
    summary: {
      pnl: '$1.00', win_rate: 0.5, sharpe: 1, max_drawdown: '$1',
      total_trades: trades, total_signals: 1, rejected_signals: 0,
    },
    data_fingerprint: 'fp', app_version: '0.1.0', is_favorite: false,
    failure_reason: null,
  })

  it('summarizes the loaded runs above the table', () => {
    queryState = {
      data: { pages: [{ runs: [run('a', 'finished', 5), run('b', 'finished', 7), run('c', 'failed', 0)] }] },
      isLoading: false,
      isError: false,
      hasNextPage: false,
    }
    wrapQ(<RunsList />)
    const stats = screen.getByTestId('runs-stats')
    expect(stats.textContent).toContain('3')      // loaded
    expect(stats.textContent).toContain('2')      // finished
    expect(stats.textContent).toContain('12')     // trades across loaded runs
    expect(stats.textContent?.toLowerCase()).toContain('loaded')
  })

  it('keeps columns aligned at any width via a min-width scroll container', () => {
    queryState = {
      data: { pages: [{ runs: [run('a', 'finished', 5)] }] },
      isLoading: false,
      isError: false,
      hasNextPage: false,
    }
    wrapQ(<RunsList />)
    const scroll = screen.getByTestId('runs-scroll')
    expect(scroll).toHaveStyle({ overflowX: 'auto' })
  })
})
