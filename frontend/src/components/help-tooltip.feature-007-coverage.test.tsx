/**
 * Feature 007 structural HelpTooltip coverage (T128).
 *
 * Asserts that every new Feature 007 concept key has a <HelpTooltip />
 * rendered somewhere in the authenticated app shell. Adding a key to
 * the enum without a corresponding tooltip causes this test to fail.
 *
 * Implementation note: rather than mount the full TanStack-routed app
 * (which requires Supabase + Query providers + msw), this test renders
 * the union of authenticated surface area (topbar + runs page + dialogs
 * + strategies + data) under a QueryClient + minimal mocks, then
 * walks the DOM for `[data-help-key]` attributes.
 */
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'

// ──────────────────────────────────────────────────────────────────────
// Mocks: bypass network, auth, and TanStack router context entirely.
// ──────────────────────────────────────────────────────────────────────
vi.mock('@tanstack/react-router', async () => {
  return {
    Link: ({ children, ...rest }: { children: ReactNode }) =>
      createElement('a', { ...(rest as Record<string, unknown>) }, children),
    Navigate: () => null,
    useNavigate: () => vi.fn(),
    useMatchRoute: () => () => false,
  }
})
vi.mock('@/hooks/useHealth', () => ({
  useHealth: () => ({ state: 'healthy' }),
}))
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { email: 'jane@example.com' }, signOut: vi.fn() }),
}))
vi.mock('@/hooks/useRuns', () => ({
  useRuns: () => ({
    isLoading: false,
    isError: false,
    data: { pages: [{ runs: [], next_cursor: null }], pageParams: [] },
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }),
  flattenRuns: () => [],
  runsQueryKey: () => ['runs', 'list'],
  useInvalidateRuns: () => () => {},
}))
vi.mock('@/hooks/useStrategies', () => ({
  useStrategies: () => ({
    data: [
      { key: 'vwap_pullback_long', display_name: 'VWAP', description: '', symbol: 'SPY', direction: 'LONG', kind: 'rule_based', enabled: true },
    ],
    isLoading: false,
    isError: false,
  }),
}))
vi.mock('@/hooks/useStartBacktest', () => ({
  useStartBacktest: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/useStartDataDownload', () => ({
  useStartDataDownload: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/useDataDownloadJob', () => ({
  useDataDownloadJob: () => ({ isLoading: false, isError: false, data: undefined }),
}))
vi.mock('@/hooks/useRun', () => ({
  useRun: () => ({
    isLoading: false,
    isError: false,
    data: {
      id: '11111111-1111-1111-1111-111111111111',
      started_at: '2026-05-31T13:30:00Z',
      finished_at: '2026-05-31T13:35:00Z',
      status: 'finished',
      range_start: '2026-05-30',
      range_end: '2026-05-31',
      bar_count: 78,
      summary: {
        pnl: '$0',
        win_rate: 0.5,
        sharpe: 1,
        max_drawdown: '$0',
        total_trades: 1,
        total_signals: 1,
        rejected_signals: 0,
      },
      data_fingerprint: '',
      app_version: '',
    },
  }),
}))
vi.mock('@/hooks/useRunSignals', () => ({
  useRunSignals: () => ({ data: { pages: [], pageParams: [] }, isLoading: false, isError: false }),
  flattenSignals: () => [],
}))

const FEATURE_007_KEYS = [
  'otp',
  'session',
  'saved_config',
  'strategy_registry',
  'backtest_queue',
  'run_status',
  'cloud_push',
  'data_download_job',
  'connection_status',
] as const

describe('Feature 007 HelpTooltip coverage (T128 / SC-008)', () => {
  it('every Feature 007 concept has at least one rendered HelpTooltip', async () => {
    const { AuthenticatedTopbar } = await import('./authenticated-topbar')
    const { StrategyHero } = await import('./strategies/strategy-hero')
    const { StartBacktestDialog } = await import('./runs/StartBacktestDialog')
    const { SignalsTable } = await import('./runs/SignalsTable')
    const { RunDetail } = await import('./runs/RunDetail')
    const { DataDownloadForm } = await import('./data/DataDownloadForm')
    const { SignInForm } = await import('./auth/SignInForm')
    const { OtpCodeForm } = await import('./auth/OtpCodeForm')
    const { RunsList } = await import('./runs/RunsList')

    const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
    const tree = (
      <QueryClientProvider client={client}>
        <AuthenticatedTopbar />
        <RunsList />
        <StrategyHero />
        <StartBacktestDialog open onClose={() => {}} />
        <SignalsTable runId="11111111-1111-1111-1111-111111111111" />
        <RunDetail runId="11111111-1111-1111-1111-111111111111" />
        <DataDownloadForm onStarted={() => {}} />
        <SignInForm onSubmit={() => {}} />
        <OtpCodeForm email="x@y.z" onSubmit={() => {}} />
      </QueryClientProvider>
    )
    render(tree)
    const missing: string[] = []
    for (const key of FEATURE_007_KEYS) {
      if (!document.querySelector(`[data-help-key="${key}"]`)) missing.push(key)
    }
    expect(missing).toEqual([])
  })
})
