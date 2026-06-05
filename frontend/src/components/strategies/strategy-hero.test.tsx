import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { StrategyHero } from './strategy-hero'

const listStrategiesMock = vi.fn()
vi.mock('@/api/strategies', () => ({
  listStrategies: () => listStrategiesMock(),
}))

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const vwap = {
  key: 'vwap_pullback_long',
  display_name: 'VWAP Pullback (Long)',
  description:
    'After the opening range completes, a long signal is generated when SPY pulls back to its VWAP from above, with confirmation.',
  symbol: 'SPY',
  direction: 'LONG',
  kind: 'rule_based',
  enabled: true,
}

beforeEach(() => listStrategiesMock.mockReset())

describe('StrategyHero', () => {
  it('renders identity row: name, registry chips, active badge, description, tooltip', async () => {
    listStrategiesMock.mockResolvedValue({ strategies: [vwap] })
    wrap(<StrategyHero />)
    await waitFor(() =>
      expect(screen.getByText('VWAP Pullback (Long)')).toBeInTheDocument(),
    )
    expect(screen.getByText('SPY')).toBeInTheDocument()
    expect(screen.getByText('LONG')).toBeInTheDocument()
    expect(screen.getByText('rule_based')).toBeInTheDocument()
    expect(screen.getByText(/active strategy/)).toBeInTheDocument()
    expect(screen.getByText(/pulls back to its VWAP/)).toBeInTheDocument()
    expect(document.querySelector('[data-help-key="strategy_registry"]')).toBeTruthy()
    expect(screen.getByTestId('strategy-card-vwap_pullback_long')).toBeInTheDocument()
  })

  it('renders Entry / Stop / Target explainer cards for vwap_pullback_long', async () => {
    listStrategiesMock.mockResolvedValue({ strategies: [vwap] })
    wrap(<StrategyHero />)
    await waitFor(() => expect(screen.getByText('Entry')).toBeInTheDocument())
    expect(screen.getByText('Stop')).toBeInTheDocument()
    expect(screen.getByText('Target')).toBeInTheDocument()
    expect(screen.getByText('opening-range high')).toBeInTheDocument()
    expect(screen.getByText('below VWAP')).toBeInTheDocument()
  })

  it('omits the explainer grid for a strategy key without prose', async () => {
    listStrategiesMock.mockResolvedValue({
      strategies: [{ ...vwap, key: 'mystery_strategy' }],
    })
    wrap(<StrategyHero />)
    await waitFor(() =>
      expect(screen.getByText('VWAP Pullback (Long)')).toBeInTheDocument(),
    )
    expect(screen.queryByText('Entry')).toBeNull()
  })

  it('shows the empty state when no strategies are enabled', async () => {
    listStrategiesMock.mockResolvedValue({ strategies: [] })
    wrap(<StrategyHero />)
    await waitFor(() =>
      expect(screen.getByText('No enabled strategies.')).toBeInTheDocument(),
    )
  })
})
