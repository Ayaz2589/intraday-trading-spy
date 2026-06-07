// Feature 021 T036 — the forward performance record (US3).
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ForwardPerformance } from './ForwardPerformance'
import type { TradePerformance } from '@/api/trade'

const PERF: TradePerformance = {
  summary: { trades: 2, wins: 1, win_rate: 0.5, expectancy_r: 0.5,
             total_r: 1.0, total_gross_pnl: 10.0 },
  equity_curve: [
    { t: '2026-06-08T15:00:00Z', cum_pnl: 20 },
    { t: '2026-06-08T15:45:00Z', cum_pnl: 10 },
  ],
  trades: [
    { id: 't1', session_id: 'ps-1', trading_day: '2026-06-08',
      origin: 'strategy', qty: 10, entry_time: '2026-06-08T14:00:00Z',
      exit_time: '2026-06-08T15:00:00Z', entry_price: 525, exit_price: 527,
      stop_loss: 524, take_profit: 527, exit_reason: 'target',
      gross_pnl: 20, fees: 0, realized_r: 2 },
    { id: 't2', session_id: 'ps-1', trading_day: '2026-06-08',
      origin: 'manual', qty: 10, entry_time: '2026-06-08T15:30:00Z',
      exit_time: '2026-06-08T15:45:00Z', entry_price: 525, exit_price: 524,
      stop_loss: 524, take_profit: 527, exit_reason: 'stop',
      gross_pnl: -10, fees: 0, realized_r: -1 },
  ],
  sessions: [],
}

describe('ForwardPerformance', () => {
  it('shows summary metrics in backtest vocabulary', () => {
    render(<ForwardPerformance perf={PERF} />)
    const el = screen.getByTestId('forward-performance')
    expect(el).toHaveTextContent('2')          // trades
    expect(el).toHaveTextContent('50%')        // win rate
    expect(el).toHaveTextContent('+1.00R')     // total R
  })

  it('lists trades with R multiples and exit reasons', () => {
    render(<ForwardPerformance perf={PERF} />)
    expect(screen.getByText('target')).toBeInTheDocument()
    expect(screen.getByText('stop')).toBeInTheDocument()
    expect(screen.getByText('+2.00R')).toBeInTheDocument()
    expect(screen.getByText('manual')).toBeInTheDocument()  // origin column
  })

  it('shows the teaching empty state with no trades yet', () => {
    render(<ForwardPerformance perf={{ ...PERF, trades: [], equity_curve: [],
      summary: { trades: 0, wins: 0, win_rate: null, expectancy_r: null,
                 total_r: 0, total_gross_pnl: 0 } }} />)
    expect(screen.getByText(/no paper trades yet/i)).toBeInTheDocument()
  })

  it('pairs the forward record with a HelpTooltip', () => {
    const { container } = render(<ForwardPerformance perf={PERF} />)
    expect(container.querySelector('[data-help-key="forward_record"]')).toBeTruthy()
  })
})
