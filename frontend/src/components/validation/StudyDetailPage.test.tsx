// T026 (Feature 014, FR-011) — study detail page composition (extracted from
// the route so TanStack file-based routing never sees a test file).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StudyDetailPage } from './StudyDetailPage'
import type { ValidationStudy, ValidationStudyStatus } from '@/api/types'

function study(over: Partial<ValidationStudy> = {}): ValidationStudy {
  return {
    id: 's1', kind: 'walk_forward', status: 'finished', progress_completed: 2,
    progress_total: 2, result: null, failure_reason: null,
    created_at: '2026-06-03T14:00:00Z', config_name: 'wf-rr3', ...over,
  }
}

function wm(over: Record<string, unknown> = {}) {
  return {
    segment: 'validation', range_start: '2019-01-02', range_end: '2019-03-29',
    run_id: 'r-oos', persisted: true, total_trades: 54, expectancy_dollars: 0.11,
    expectancy_r: 0.01, win_rate: 0.49, profit_factor: 1.2, sharpe: 0.3,
    total_net_pnl_dollars: 118, low_confidence: false, ...over,
  }
}

const WF_RESULT = {
  mode: 'rolling', train_months: 12, step_months: 3, validation_months: 3,
  windows: [
    { window_index: 0, in_sample: wm({ segment: 'train', run_id: 'r-is' }), out_of_sample: wm(), gap: { expectancy_r: 0.01 } },
  ],
  mean_oos: { expectancy_dollars: 0.95 },
  mean_gap: { expectancy_r: 0.0054 },
}

const RR = 'strategy.vwap_pullback.target.risk_reward'
const SURFACE = {
  metric_name: 'expectancy_dollars', knobs: [RR], axes: { [RR]: [1.5, 2.0] },
  points: [
    { coords: { [RR]: 1.5 }, metric: 0.4, trade_count: 40, low_confidence: false, run_id: 'p1', persisted: true },
    { coords: { [RR]: 2.0 }, metric: 0.6, trade_count: 41, low_confidence: false, run_id: 'p2', persisted: true },
  ],
  segment: 'train',
}

const DONE: ValidationStudyStatus = {
  status: 'finished', progress_completed: 2, progress_total: 2, failure_reason: null,
} as ValidationStudyStatus

describe('StudyDetailPage — walk-forward', () => {
  it('composes header card, stat cards, and expandable window rows', () => {
    render(<StudyDetailPage study={study({ result: WF_RESULT })} status={DONE} />)
    expect(screen.getByTestId('study-header-card')).toBeInTheDocument()
    expect(screen.getByTestId('study-stat-cards')).toBeInTheDocument()
    expect(screen.getByTestId('window-row-0')).toBeInTheDocument()
  })

  it('renders a pre-014 study (no persisted keys) with zero run links', () => {
    const old = {
      ...WF_RESULT,
      windows: [
        {
          window_index: 0,
          in_sample: wm({ run_id: 'x', persisted: undefined }),
          out_of_sample: wm({ run_id: 'y', persisted: undefined }),
          gap: {},
        },
      ],
    }
    render(<StudyDetailPage study={study({ result: old })} status={DONE} />)
    expect(screen.getByTestId('window-row-0')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /view run/i })).not.toBeInTheDocument()
  })
})

describe('StudyDetailPage — sensitivity', () => {
  it('renders the surface plot card plus the points table', () => {
    render(
      <StudyDetailPage
        study={study({ kind: 'sensitivity', result: SURFACE })}
        status={DONE}
      />,
    )
    expect(screen.getByTestId('study-header-card')).toBeInTheDocument()
    expect(screen.getAllByTestId(/point-row-/)).toHaveLength(2)
  })
})

describe('StudyDetailPage — in flight / failed', () => {
  it('shows live progress while running', () => {
    render(
      <StudyDetailPage
        study={study({ status: 'running', result: null })}
        status={{ status: 'running', progress_completed: 1, progress_total: 4, failure_reason: null } as ValidationStudyStatus}
      />,
    )
    expect(screen.getByTestId('study-progress').textContent).toContain('1/4')
  })

  it('shows the failure reason for failed studies', () => {
    render(
      <StudyDetailPage
        study={study({ status: 'failed', failure_reason: 'window produced no bars', result: null })}
        status={{ status: 'failed', progress_completed: 0, progress_total: 4, failure_reason: 'window produced no bars' } as ValidationStudyStatus}
      />,
    )
    expect(screen.getByTestId('study-header-card').textContent).toContain('window produced no bars')
  })
})
