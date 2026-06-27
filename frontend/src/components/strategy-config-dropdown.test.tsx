// Strategy panel redesign: the topbar dropdown becomes a read-only strategy
// SELECTOR — pick the active config, read its description + knob values.
// No knob editing, no date range, no run/save/reset (backtests don't launch
// from here anymore). Footer: "Create new strategy" → /strategies.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Config, Strategy } from '@/api/types'

const navigate = vi.fn()
const activateMutate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

function config(over: Partial<Config>): Config {
  return {
    id: 'c1',
    name: 'wf-rr3',
    is_active: true,
    strategy_id: 's1',
    mode: 'backtest',
    live_auto_enabled: false,
    timeframe: '5m',
    params: {
      risk: {
        account_value: 25000,
        max_risk_per_trade_pct: 0.1,
        max_position_value_pct: 400,
        max_consecutive_losses: 2,
      },
      strategy: {
        enabled_setup: 'vwap_pullback_long',
        opening_range: { minutes: 15 },
        vwap_pullback: {
          target: { risk_reward: 3 },
          stop: { buffer_pct: 0.05 },
          max_distance_from_vwap_pct: 0.25,
        },
      },
    },
    ...over,
  } as Config
}

// Feature 025 — the active config's auto-derived human summary.
const ACTIVE_SUMMARY = 'VWAP pullback · ≤0.25% from VWAP · 0.05% stop buffer · 3:1 R:R'
const CONFIGS = [
  config({ summary: ACTIVE_SUMMARY }),
  config({ id: 'c2', name: 'default', is_active: false }),
]

const STRATEGY: Strategy = {
  key: 'vwap_pullback_long',
  display_name: 'VWAP Pullback (Long)',
  description: 'Buys pullbacks to VWAP after the opening range completes.',
  symbol: 'SPY',
  direction: 'LONG',
  kind: 'rule_based',
  enabled: true,
}

vi.mock('@/hooks/useConfigs', () => ({
  useConfigs: () => ({ data: { configs: CONFIGS } }),
  useActivateConfig: () => ({ mutate: activateMutate, isPending: false }),
}))
vi.mock('@/hooks/useStrategies', () => ({
  useStrategies: () => ({ data: [STRATEGY] }),
}))

import { StrategyConfigDropdown } from './strategy-config-dropdown'

function openPanel() {
  render(<StrategyConfigDropdown />)
  fireEvent.click(screen.getByTestId('strategy-dropdown-trigger'))
}

describe('<StrategyConfigDropdown /> (read-only selector redesign)', () => {
  beforeEach(() => {
    navigate.mockClear()
    activateMutate.mockClear()
  })

  it('trigger shows the active strategy (config) name', () => {
    render(<StrategyConfigDropdown />)
    expect(screen.getByTestId('strategy-dropdown-trigger').textContent).toContain('wf-rr3')
  })

  it('opens to a config selector + description with knob values', () => {
    openPanel()
    expect(screen.getByTestId('strategy-dropdown-config')).toBeInTheDocument()
    const desc = screen.getByTestId('strategy-description')
    expect(desc.textContent).toContain('VWAP Pullback (Long)')
    expect(desc.textContent).toContain('Buys pullbacks to VWAP')
    // knob values rendered as text
    expect(desc.textContent).toContain('25,000')
    expect(desc.textContent).toContain('400')
    expect(desc.textContent).toContain('0.1')
    expect(desc.textContent).toContain('15')
    expect(desc.textContent).toContain('0.05')
    expect(desc.textContent).toContain('0.25')
  })

  it('has NO knob inputs, date range, or run/save/reset actions', () => {
    openPanel()
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /run backtest/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/backtest date range/i)).not.toBeInTheDocument()
  })

  it('selecting another config activates it', () => {
    openPanel()
    fireEvent.change(screen.getByTestId('strategy-dropdown-config'), {
      target: { value: 'c2' },
    })
    expect(activateMutate).toHaveBeenCalledWith('c2')
  })

  it('Create new strategy navigates to /strategies', () => {
    openPanel()
    fireEvent.click(screen.getByRole('button', { name: /create new strategy/i }))
    expect(navigate).toHaveBeenCalledWith({ to: '/strategies' })
  })

  // Feature 025 (US2) — the active config's human-readable summary helps the
  // user confirm they're selecting the right config.
  it('shows the active config summary in the panel', () => {
    openPanel()
    expect(screen.getByTestId('config-summary')).toHaveTextContent(ACTIVE_SUMMARY)
    // and it lives inside the description box, next to the name (not replacing it)
    expect(screen.getByTestId('strategy-description').textContent).toContain(ACTIVE_SUMMARY)
  })

  it('exposes the active config summary on the trigger title', () => {
    render(<StrategyConfigDropdown />)
    expect(screen.getByTestId('strategy-dropdown-trigger')).toHaveAttribute('title', ACTIVE_SUMMARY)
  })
})
