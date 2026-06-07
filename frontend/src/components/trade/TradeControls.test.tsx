// Feature 021 T027 — start/stop/ack controls + session status.
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TradeControls } from './TradeControls'
import type { TradeState } from '@/api/trade'

const base = (over: Partial<TradeState> = {}): TradeState => ({
  session: null,
  market: {
    is_open: true, allow_new_trades: true, force_flat_at: '15:55:00',
    no_new_trades_after: '15:30:00', session_start: '09:30:00',
    data_fresh: true, last_bar_at: '2026-06-08T14:00:00Z',
  },
  position: null,
  open_orders: [],
  today: { trades: 0, fills: 0, realized_pnl: 0 },
  account: null,
  ...over,
})

const session = (over = {}) => ({
  id: 'ps-1', strategy_id: 's', config_id: 'c', config_name: 'default',
  config_snapshot: {}, status: 'running' as const, entries_paused: false,
  pause_reason: null, started_at: '2026-06-08T13:30:00Z', stopped_at: null,
  stop_reason: null, ...over,
})

describe('TradeControls', () => {
  it('offers Start when nothing is running', () => {
    const onStart = vi.fn()
    render(<TradeControls state={base()} onStart={onStart} onStop={vi.fn()} onAck={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /start automation/i }))
    expect(onStart).toHaveBeenCalled()
  })

  it('explains arming when the market is closed', () => {
    const state = base()
    state.market.is_open = false
    render(<TradeControls state={state} onStart={vi.fn()} onStop={vi.fn()} onAck={vi.fn()} />)
    expect(screen.getByText(/next session open/i)).toBeInTheDocument()
  })

  it('shows running status and Stop while a session runs', () => {
    const onStop = vi.fn()
    render(
      <TradeControls state={base({ session: session() })}
        onStart={vi.fn()} onStop={onStop} onAck={vi.fn()} />,
    )
    expect(screen.getByTestId('automation-status')).toHaveTextContent(/running/i)
    fireEvent.click(screen.getByRole('button', { name: /stop automation/i }))
    expect(onStop).toHaveBeenCalled()
  })

  it('shows armed when running with the market closed', () => {
    const state = base({ session: session() })
    state.market.is_open = false
    render(<TradeControls state={state} onStart={vi.fn()} onStop={vi.fn()} onAck={vi.fn()} />)
    expect(screen.getByTestId('automation-status')).toHaveTextContent(/armed/i)
  })

  it('drift pause surfaces an acknowledge button', () => {
    const onAck = vi.fn()
    const state = base({
      session: session({ entries_paused: true, pause_reason: 'reconcile_mismatch' }),
    })
    render(<TradeControls state={state} onStart={vi.fn()} onStop={vi.fn()} onAck={onAck} />)
    expect(screen.getByText(/mismatch/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /acknowledge/i }))
    expect(onAck).toHaveBeenCalled()
  })

  it('pairs the automation concept with a HelpTooltip', () => {
    const { container } = render(
      <TradeControls state={base()} onStart={vi.fn()} onStop={vi.fn()} onAck={vi.fn()} />,
    )
    expect(container.querySelector('[data-help-key="automation_session"]')).toBeTruthy()
  })
})
