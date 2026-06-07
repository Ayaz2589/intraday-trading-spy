// Feature 022 (T016/T033/T044) — the /trade/historic page composition.
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

const datesMock = vi.fn()
const stateMock = vi.fn()
const barsMock = vi.fn()
const journalMock = vi.fn()
const perfMock = vi.fn()
vi.mock('@/api/replay', () => ({
  getReplayDates: () => datesMock(),
  getReplayState: () => stateMock(),
  getReplayBars: (...a: unknown[]) => barsMock(...a),
  getReplayJournal: (...a: unknown[]) => journalMock(...a),
  getReplayPerformance: () => perfMock(),
  startReplay: vi.fn(),
  controlReplay: vi.fn(),
  stopReplay: vi.fn(),
  submitReplayOrder: vi.fn(),
  closeReplayPosition: vi.fn(),
}))

const { HistoricTradePage } = await import('./HistoricTradePage')

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  render(
    <QueryClientProvider client={client}>
      <HistoricTradePage />
    </QueryClientProvider>,
  )
}

describe('HistoricTradePage', () => {
  it('start state: simulation banner, controls, chart, journal', async () => {
    datesMock.mockResolvedValue({ dates: ['2026-05-26'], earliest: '2026-05-26', latest: '2026-05-26' })
    stateMock.mockResolvedValue({ session: null })
    barsMock.mockResolvedValue({ view: '5m', bars: [], vwap_available: true,
      vwap_reason: null, position_levels: null, next_since: null })
    journalMock.mockResolvedValue({ events: [] })
    perfMock.mockResolvedValue({ summary: { trades: 0, wins: 0, win_rate: null,
      expectancy_r: null, total_r: 0, gross_pnl: 0 }, equity_curve: [], trades: [] })

    renderPage()
    expect(screen.getByTestId('historic-sim-banner')).toHaveTextContent(/historical simulation/i)
    await waitFor(() => expect(screen.getByTestId('replay-controls')).toBeInTheDocument())
    expect(screen.getByTestId('live-chart')).toBeInTheDocument()
    expect(screen.getByTestId('live-journal')).toBeInTheDocument()
  })

  it('active replay: shows trade panel + manual order form', async () => {
    datesMock.mockResolvedValue({ dates: ['2026-05-26'], earliest: '2026-05-26', latest: '2026-05-26' })
    stateMock.mockResolvedValue({
      session: { id: 'x', session_date: '2026-05-26', status: 'playing',
                 automation: true, speed: 300, sim_clock: '2026-05-26T10:00:00-04:00',
                 bars_total: 78, bars_delivered: 20 },
      position: null,
      today: { trades: 0, realized_pnl: 0, realized_r: 0 },
      account: { sizing_account_value: 25000, equity: 25000 },
    })
    barsMock.mockResolvedValue({ view: '5m', bars: [], vwap_available: true,
      vwap_reason: null, position_levels: null, next_since: null })
    journalMock.mockResolvedValue({ events: [] })
    perfMock.mockResolvedValue({ summary: { trades: 0, wins: 0, win_rate: null,
      expectancy_r: null, total_r: 0, gross_pnl: 0 }, equity_curve: [], trades: [] })

    renderPage()
    await waitFor(() => expect(screen.getByTestId('replay-status')).toHaveTextContent('playing'))
    expect(screen.getByTestId('replay-account')).toBeInTheDocument()
    expect(screen.getByTestId('manual-order-form')).toBeInTheDocument()
  })
})
