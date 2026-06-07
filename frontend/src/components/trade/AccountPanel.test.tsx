// Feature 021 T031 — broker-truth account panel.
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AccountPanel } from './AccountPanel'
import type { TradeState } from '@/api/trade'

const state = (over: Partial<TradeState> = {}): TradeState => ({
  session: null,
  market: {
    is_open: true, allow_new_trades: true, force_flat_at: '15:55:00',
    no_new_trades_after: '15:30:00', session_start: '09:30:00',
    data_fresh: true, last_bar_at: '2026-06-08T14:00:00Z',
  },
  position: { qty: 12, avg_entry: 525.1, unrealized_pnl: 14.4 },
  open_orders: [
    { broker_order_id: 'b1', status: 'accepted', side: 'sell', qty: 12,
      limit_price: 526.9, stop_price: null, type: 'limit' },
    { broker_order_id: 'b2', status: 'accepted', side: 'sell', qty: 12,
      limit_price: null, stop_price: 524.2, type: 'stop' },
  ],
  today: { trades: 2, fills: 4, realized_pnl: -12.5 },
  account: {
    broker_equity: 100231.55, sizing_account_value: 25000,
    reconciled_at: '2026-06-08T14:00:00Z', drift: false,
  },
  ...over,
})

describe('AccountPanel', () => {
  it('shows position, protective orders, today, and both account figures', () => {
    render(<AccountPanel state={state()} />)
    const panel = screen.getByTestId('account-panel')
    expect(panel).toHaveTextContent('12')          // qty
    expect(panel).toHaveTextContent('525.10')      // avg entry
    expect(panel).toHaveTextContent('526.90')      // target leg
    expect(panel).toHaveTextContent('524.20')      // stop leg
    expect(panel).toHaveTextContent(/100,231/)     // broker equity
    expect(panel).toHaveTextContent(/25,000/)      // sizing account value
    expect(panel).toHaveTextContent('-12.50')      // today realized
  })

  it('shows flat state when there is no position', () => {
    render(<AccountPanel state={state({ position: null, open_orders: [] })} />)
    expect(screen.getByTestId('account-panel')).toHaveTextContent(/flat/i)
  })

  it('explains broker equity vs sizing value with tooltips', () => {
    const { container } = render(<AccountPanel state={state()} />)
    expect(container.querySelector('[data-help-key="paper_account"]')).toBeTruthy()
    expect(container.querySelector('[data-help-key="sizing_account_value"]')).toBeTruthy()
    expect(container.querySelector('[data-help-key="protective_orders"]')).toBeTruthy()
  })

  it('degrades gracefully without broker access', () => {
    render(<AccountPanel state={state({ position: null, open_orders: null, account: null })} />)
    expect(screen.getByTestId('account-panel')).toHaveTextContent(/broker unavailable/i)
  })
})
