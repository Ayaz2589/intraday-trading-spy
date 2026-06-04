// T019 (Feature 014, FR-011) — study detail stat cards (per-kind variants).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StudyStatCards } from './StudyStatCards'
import type { ValidationStudy } from '@/api/types'

function study(over: Partial<ValidationStudy> = {}): ValidationStudy {
  return {
    id: 's1', kind: 'walk_forward', status: 'finished', progress_completed: 4,
    progress_total: 4, result: null, failure_reason: null,
    created_at: '2026-06-03T14:00:00Z', config_name: 'default', ...over,
  }
}

function wm(over: Record<string, unknown> = {}) {
  return {
    segment: 'validation', range_start: '2019-01-02', range_end: '2019-03-29',
    run_id: 'r', persisted: true, total_trades: 50, expectancy_dollars: 0.5,
    expectancy_r: 0.01, win_rate: 0.5, profit_factor: 1.2, sharpe: 0.3,
    total_net_pnl_dollars: 100, low_confidence: false, ...over,
  }
}

const WF_RESULT = {
  mode: 'rolling', train_months: 12, step_months: 3, validation_months: 3,
  windows: [
    { window_index: 0, in_sample: wm({ segment: 'train' }), out_of_sample: wm({ total_trades: 41 }), gap: {} },
    { window_index: 1, in_sample: wm({ segment: 'train' }), out_of_sample: wm({ total_trades: 59 }), gap: {} },
  ],
  mean_oos: { expectancy_dollars: 0.95 },
  mean_gap: { expectancy_r: 0.0054 },
}

describe('StudyStatCards — walk-forward', () => {
  it('shows mean OOS expectancy, gap, windows, and OOS trades', () => {
    render(<StudyStatCards study={study({ result: WF_RESULT })} />)
    const cards = screen.getByTestId('study-stat-cards')
    expect(cards.textContent).toContain('+$0.95')
    expect(cards.textContent).toContain('+0.0054R')
    expect(cards.textContent).toContain('2')       // windows
    expect(cards.textContent).toContain('100')     // 41 + 59 OOS trades
  })

  it('renders nothing without a finished result', () => {
    render(<StudyStatCards study={study({ status: 'running', result: null })} />)
    expect(screen.queryByTestId('study-stat-cards')).not.toBeInTheDocument()
  })
})

describe('StudyStatCards — sensitivity', () => {
  const SURFACE = {
    metric_name: 'expectancy_dollars',
    knobs: ['strategy.vwap_pullback.target.risk_reward'],
    axes: { 'strategy.vwap_pullback.target.risk_reward': [1.5, 2.0, 2.5] },
    points: [
      { coords: { 'strategy.vwap_pullback.target.risk_reward': 1.5 }, metric: 0.4, trade_count: 40, low_confidence: false, run_id: 'a', persisted: true },
      { coords: { 'strategy.vwap_pullback.target.risk_reward': 2.0 }, metric: 1.9, trade_count: 38, low_confidence: false, run_id: 'b', persisted: true },
      { coords: { 'strategy.vwap_pullback.target.risk_reward': 2.5 }, metric: 0.9, trade_count: 31, low_confidence: true, run_id: 'c', persisted: true },
    ],
    segment: 'train',
  }

  it('shows metric, point count, and the best point', () => {
    render(<StudyStatCards study={study({ kind: 'sensitivity', result: SURFACE })} />)
    const cards = screen.getByTestId('study-stat-cards')
    expect(cards.textContent).toContain('expectancy_dollars')
    expect(cards.textContent).toContain('3')      // grid points
    expect(cards.textContent).toContain('1.9')    // best metric value
    expect(cards.textContent).toContain('2')      // best coords value
  })
})
