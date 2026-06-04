// T018 (Feature 014, FR-011) — study detail header card.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StudyHeaderCard } from './StudyHeaderCard'
import type { ValidationStudy } from '@/api/types'

function study(over: Partial<ValidationStudy> = {}): ValidationStudy {
  return {
    id: 's1', kind: 'walk_forward', status: 'finished', progress_completed: 16,
    progress_total: 16, result: null, failure_reason: null,
    created_at: '2026-06-03T14:00:00Z', config_name: 'wf-rr3', ...over,
  }
}

const WF_RESULT = {
  mode: 'rolling', train_months: 12, step_months: 3, validation_months: 3,
  windows: [], mean_oos: {}, mean_gap: {},
}

describe('StudyHeaderCard', () => {
  it('shows kind, config name, and status pill', () => {
    render(<StudyHeaderCard study={study()} />)
    const card = screen.getByTestId('study-header-card')
    expect(card.textContent).toContain('walk-forward')
    expect(card.textContent).toContain('wf-rr3')
    expect(card.textContent).toContain('finished')
    expect(card.textContent).toContain('16/16')
  })

  it('derives a params subtitle from a walk-forward result', () => {
    render(<StudyHeaderCard study={study({ result: WF_RESULT })} />)
    const sub = screen.getByTestId('study-header-subtitle')
    expect(sub.textContent).toContain('rolling')
    expect(sub.textContent).toContain('12m train')
    expect(sub.textContent).toContain('3m step')
  })

  it('derives a subtitle from a sensitivity result', () => {
    const s = study({
      kind: 'sensitivity',
      result: { metric_name: 'expectancy_dollars', knobs: ['a.b'], axes: {}, points: [], segment: 'train' },
    })
    render(<StudyHeaderCard study={s} />)
    const sub = screen.getByTestId('study-header-subtitle')
    expect(sub.textContent).toContain('expectancy_dollars')
    expect(sub.textContent).toContain('train')
  })

  it('renders the action slot (re-run button home)', () => {
    render(<StudyHeaderCard study={study()} action={<button>Re-run study</button>} />)
    expect(screen.getByRole('button', { name: /re-run study/i })).toBeInTheDocument()
  })

  it('shows the failure reason for failed studies', () => {
    render(<StudyHeaderCard study={study({ status: 'failed', failure_reason: 'no bars' })} />)
    expect(screen.getByTestId('study-header-card').textContent).toContain('no bars')
  })
})
