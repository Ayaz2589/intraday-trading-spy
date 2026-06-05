import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StudiesTable, resultSummary } from './StudiesTable'
import type { ValidationStudy } from '@/api/types'

function study(over: Partial<ValidationStudy>): ValidationStudy {
  return {
    id: 's1', kind: 'walk_forward', status: 'finished', progress_completed: 24,
    progress_total: 24, result: null, failure_reason: null,
    created_at: '2026-06-04T14:00:00Z', config_name: 'wf-rr3', ...over,
  }
}

const WF_RESULT = {
  mode: 'rolling', train_months: 12, step_months: 6, validation_months: 6,
  windows: [], mean_oos: { expectancy_dollars: 0.95 }, mean_gap: { expectancy_r: 0.0054 },
}

describe('StudiesTable', () => {
  it('shows the stats row and a config column', () => {
    render(<StudiesTable studies={[study({}), study({ id: 's2', status: 'failed', config_name: 'default' })]} />)
    const stats = screen.getByTestId('studies-stats')
    expect(stats.textContent).toContain('2')
    expect(stats.textContent?.toLowerCase()).toContain('evaluations')
    expect(screen.getByTestId('study-row-s1').textContent).toContain('wf-rr3')
    expect(screen.getByTestId('study-row-s2').textContent).toContain('default')
  })

  it('expands a row to the detail grid with the result summary', () => {
    render(<StudiesTable studies={[study({ result: WF_RESULT })]} />)
    expect(screen.queryByTestId('study-detail-s1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('study-row-s1'))
    const detail = screen.getByTestId('study-detail-s1')
    expect(detail.textContent).toContain('s1')
    expect(detail.textContent).toContain('+$0.95/trade')
    expect(detail.textContent).toContain('+0.0054R')
    expect(screen.getByRole('link', { name: /open full results/i })).toHaveAttribute('href', '/validation/s1')
  })

  it('failed rows expose the failure reason in the detail', () => {
    render(<StudiesTable studies={[study({ status: 'failed', failure_reason: 'window produced no bars' })]} />)
    fireEvent.click(screen.getByTestId('study-row-s1'))
    expect(screen.getByTestId('study-failure-s1').textContent).toContain('window produced no bars')
  })

  it('renders the empty state', () => {
    render(<StudiesTable studies={[]} />)
    expect(screen.getByTestId('studies-table').textContent).toMatch(/no studies yet/i)
  })

  // Feature 014 (FR-010, T030) — re-run from the studies table.
  it('shows a Re-run button in the expanded detail and calls onRerun', () => {
    const onRerun = vi.fn()
    render(<StudiesTable studies={[study({})]} onRerun={onRerun} />)
    fireEvent.click(screen.getByTestId('study-row-s1'))
    const btn = screen.getByRole('button', { name: /^↻ re-run study$/i })
    fireEvent.click(btn)
    expect(onRerun).toHaveBeenCalledWith('s1')
    expect(screen.getByLabelText(/help: re-run study/i)).toBeInTheDocument()
  })

  it('renders no Re-run button without an onRerun handler', () => {
    render(<StudiesTable studies={[study({})]} />)
    fireEvent.click(screen.getByTestId('study-row-s1'))
    expect(screen.queryByRole('button', { name: /re-run study/i })).not.toBeInTheDocument()
  })
})

describe('resultSummary', () => {
  it('summarizes walk-forward results', () => {
    expect(resultSummary(study({ result: WF_RESULT }))).toBe('mean OOS expectancy +$0.95/trade · IS→OOS gap +0.0054R')
  })

  it('summarizes sensitivity results', () => {
    const s = study({
      kind: 'sensitivity',
      result: { metric_name: 'expectancy_dollars', knobs: [], axes: {}, points: [{}, {}, {}], segment: 'train' },
    })
    expect(resultSummary(s)).toBe('expectancy_dollars across 3 grid points')
  })

  it('returns null for unfinished or empty results', () => {
    expect(resultSummary(study({ status: 'running', result: null }))).toBeNull()
    expect(resultSummary(study({ result: null }))).toBeNull()
  })
})
