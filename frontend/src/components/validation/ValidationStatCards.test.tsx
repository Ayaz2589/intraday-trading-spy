import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ValidationStatCards } from './ValidationStatCards'
import type { ValidationStudy } from '@/api/types'

function study(over: Partial<ValidationStudy>): ValidationStudy {
  return {
    id: 'x', kind: 'walk_forward', status: 'finished', progress_completed: 24,
    progress_total: 24, result: null, failure_reason: null,
    created_at: '2026-06-04T14:00:00Z', ...over,
  }
}

describe('ValidationStatCards', () => {
  it('counts studies by outcome and kind', () => {
    render(
      <ValidationStatCards
        studies={[study({}), study({ kind: 'sensitivity' }), study({ status: 'failed' })]}
        lockboxState="unspent"
      />,
    )
    const cards = screen.getByTestId('validation-stat-cards')
    expect(cards.textContent).toContain('3') // total
    expect(cards.textContent).toContain('2 walk-forward · 1 sensitivity')
  })

  it('shows the lockbox state with its hint', () => {
    render(<ValidationStatCards studies={[]} lockboxState="unspent" />)
    expect(screen.getByTestId('lockbox-stat').textContent).toBe('UNSPENT')
    expect(screen.getByTestId('validation-stat-cards').textContent).toContain('one shot')
  })

  it('degrades when lockbox state is unavailable', () => {
    render(<ValidationStatCards studies={[]} lockboxState={null} />)
    expect(screen.getByTestId('lockbox-stat').textContent).toBe('—')
  })
})
