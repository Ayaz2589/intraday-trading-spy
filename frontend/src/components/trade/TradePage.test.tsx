// Feature 021 T033 — the /trade page composition.
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('klinecharts', () => ({
  init: vi.fn(() => ({ setSymbol: vi.fn(), setPeriod: vi.fn(),
                       setDataLoader: vi.fn(), createIndicator: vi.fn(),
                       createOverlay: vi.fn(), removeOverlay: vi.fn() })),
  dispose: vi.fn(),
  registerIndicator: vi.fn(),
  registerOverlay: vi.fn(),
}))

const stateMock = vi.fn()
const barsMock = vi.fn()
const perfMock = vi.fn()
const journalMock = vi.fn()
vi.mock('@/api/trade', () => ({
  getTradeState: () => stateMock(),
  getTradeBars: (...a: unknown[]) => barsMock(...a),
  getTradePerformance: () => perfMock(),
  getTradeJournal: (...a: unknown[]) => journalMock(...a),
  startAutomation: vi.fn(),
  stopAutomation: vi.fn(),
  ackPause: vi.fn(),
  closePosition: vi.fn(),
  submitManualOrder: vi.fn(),
}))

const { TradePage } = await import('./TradePage')

describe('TradePage', () => {
  it('renders the cockpit: controls, chart, account, record, journal', async () => {
    stateMock.mockResolvedValue({
      session: null,
      market: { is_open: false, allow_new_trades: false,
                force_flat_at: '15:55:00', no_new_trades_after: '15:30:00',
                session_start: '09:30:00', data_fresh: null, last_bar_at: null },
      position: null, open_orders: null,
      today: { trades: 0, fills: 0, realized_pnl: 0 }, account: null,
    })
    barsMock.mockResolvedValue({ view: '5m', bars: [], vwap_available: true,
      vwap_reason: null, position_levels: null, next_since: null })
    perfMock.mockResolvedValue({
      summary: { trades: 0, wins: 0, win_rate: null, expectancy_r: null,
                 total_r: 0, total_gross_pnl: 0 },
      equity_curve: [], trades: [], sessions: [],
    })
    journalMock.mockResolvedValue({ events: [] })

    const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
    render(
      <QueryClientProvider client={client}>
        <TradePage />
      </QueryClientProvider>,
    )
    expect(screen.getByText(/paper trading/i)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByTestId('automation-status')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('live-chart')).toBeInTheDocument()
    expect(screen.getByTestId('account-panel')).toBeInTheDocument()
    expect(screen.getByTestId('forward-performance')).toBeInTheDocument()
    // closed-market explainer (FR-017)
    expect(screen.getByText(/market is closed/i)).toBeInTheDocument()
  })
})
