import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { HealthVerdictView } from '@/api/types'

// Feature 018 (US1): the config health badge — deterministic verdict +
// cited inputs, never LLM-derived.

const getHealthMock = vi.fn()
vi.mock('@/api/recommend', () => ({
  getRecommendHealth: (...a: unknown[]) => getHealthMock(...a),
}))

import { HealthBadge, ActiveConfigHealthBadge } from './HealthBadge'

const verdict = (over: Partial<HealthVerdictView> = {}): HealthVerdictView => ({
  config_id: 'c1',
  config_name: 'wf-rr3',
  strategy_id: 's1',
  verdict: 'failing',
  inputs: {
    window_count: 8,
    recent_median_r: -0.01,
    baseline_median_r: 0.025,
    gate_passed: false,
    gate_ci_low: -0.71,
    gate_ci_high: 2.6,
  },
  thresholds: { min_windows: 6, recent_windows: 4, degradation_margin_r: 0.02 },
  ...over,
})

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('HealthBadge', () => {
  it.each([
    ['ok', 'badge-profit'],
    ['degrading', 'badge-warn'],
    ['failing', 'badge-loss'],
    ['insufficient_evidence', 'badge-faint'],
  ] as const)('maps verdict %s to %s', (v, klass) => {
    render(<HealthBadge verdict={verdict({ verdict: v })} />)
    const badge = screen.getByTestId('health-badge').querySelector('.badge')!
    expect(badge.className).toContain(klass)
  })

  it('renders the cited inputs behind the verdict (FR-002)', () => {
    render(<HealthBadge verdict={verdict()} />)
    const badge = screen.getByTestId('health-badge').querySelector('.badge')!
    const cited = badge.getAttribute('title') ?? ''
    expect(cited).toMatch(/8 OOS windows/)
    expect(cited).toMatch(/recent median -0\.010 R/)
    expect(cited).toMatch(/baseline median 0\.025 R/)
    expect(cited).toMatch(/gate failed/)
  })

  it('explains itself with the health_verdict HelpTooltip (FR-014)', () => {
    const { container } = render(<HealthBadge verdict={verdict()} />)
    expect(container.querySelector('[data-help-key="health_verdict"]')).toBeTruthy()
  })

  it('spells out the insufficient-evidence humility state', () => {
    render(<HealthBadge verdict={verdict({ verdict: 'insufficient_evidence' })} />)
    expect(screen.getByTestId('health-badge')).toHaveTextContent(/insufficient evidence/i)
  })
})

describe('ActiveConfigHealthBadge (connected)', () => {
  it('renders the verdict fetched for its config id', async () => {
    getHealthMock.mockResolvedValue({ verdicts: [verdict()] })
    wrap(<ActiveConfigHealthBadge configId="c1" />)
    await waitFor(() => expect(screen.getByTestId('health-badge')).toBeInTheDocument())
    expect(screen.getByTestId('health-badge')).toHaveTextContent(/failing/i)
  })

  it('renders nothing for a config without OOS history', async () => {
    getHealthMock.mockResolvedValue({ verdicts: [verdict()] })
    const { container } = wrap(<ActiveConfigHealthBadge configId="no-history" />)
    await waitFor(() => expect(getHealthMock).toHaveBeenCalled())
    expect(container.querySelector('[data-testid="health-badge"]')).toBeNull()
  })
})
