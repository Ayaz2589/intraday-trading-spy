import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CacheBarChart } from './CacheBarChart'
import type { MonthStat } from '@/api/bars'

// Data-page redesign: the monthly bar chart (replaces the grid heatmap).
// Same guarantees: one element per month with its state, hover reveals the
// exact missing days, legend present — plus the summary line and year groups.

function m(month: string, state: MonthStat['state'], over: Partial<MonthStat> = {}): MonthStat {
  return {
    month,
    state,
    sessions_present: state === 'complete' ? 20 : state === 'partial' ? 19 : state === 'current' ? 3 : 0,
    sessions_expected: state === 'future' ? 0 : state === 'current' ? 3 : 20,
    bars: state === 'future' ? 0 : 1560,
    sources: state === 'future' ? [] : ['alpaca'],
    missing_dates: [],
    ...over,
  }
}

describe('CacheBarChart', () => {
  it('renders one bar per month with its state', () => {
    render(
      <CacheBarChart
        months={[
          m('2026-03', 'complete'),
          m('2026-04', 'partial', { missing_dates: ['2026-04-09'] }),
          m('2026-05', 'future'),
          m('2026-06', 'current'),
        ]}
      />,
    )
    expect(screen.getByTestId('bar-2026-03')).toHaveAttribute('data-state', 'complete')
    expect(screen.getByTestId('bar-2026-04')).toHaveAttribute('data-state', 'partial')
    expect(screen.getByTestId('bar-2026-05')).toHaveAttribute('data-state', 'future')
    expect(screen.getByTestId('bar-2026-06')).toHaveAttribute('data-state', 'current')
  })

  it('partial bar hover reveals the exact missing trading days', () => {
    render(<CacheBarChart months={[m('2026-04', 'partial', { missing_dates: ['2026-04-09', '2026-04-10'] })]} />)
    const bar = screen.getByTestId('bar-2026-04')
    expect(bar.getAttribute('title')).toContain('2026-04-09')
    expect(bar.getAttribute('title')).toContain('2026-04-10')
    expect(bar.getAttribute('title')).toMatch(/missing/i)
  })

  it('complete bar hover shows sessions and bars, not "missing"', () => {
    render(<CacheBarChart months={[m('2026-03', 'complete')]} />)
    const title = screen.getByTestId('bar-2026-03').getAttribute('title') ?? ''
    expect(title).toContain('20/20')
    expect(title).not.toMatch(/missing/i)
  })

  it('summarizes complete / in-progress / not-yet-cached months', () => {
    render(
      <CacheBarChart
        months={[m('2026-02', 'complete'), m('2026-03', 'complete'), m('2026-04', 'future'), m('2026-05', 'future'), m('2026-06', 'current')]}
      />,
    )
    const summary = screen.getByTestId('chart-summary').textContent ?? ''
    expect(summary).toContain('2 months fully cached')
    expect(summary).toContain('June 2026 in progress')
    expect(summary).toContain('2 months ahead not yet cached')
  })

  it('counts partial months in the summary when gaps exist', () => {
    render(<CacheBarChart months={[m('2026-03', 'partial', { missing_dates: ['2026-03-12'] }), m('2026-04', 'current')]} />)
    expect(screen.getByTestId('chart-summary').textContent).toContain('1 month with gaps')
  })

  it('groups bars under year labels', () => {
    render(<CacheBarChart months={[m('2025-11', 'complete'), m('2025-12', 'complete'), m('2026-01', 'current')]} />)
    expect(screen.getByTestId('year-label-2025')).toBeInTheDocument()
    expect(screen.getByTestId('year-label-2026')).toBeInTheDocument()
  })

  it('renders a legend explaining the states', () => {
    render(<CacheBarChart months={[m('2026-03', 'complete')]} />)
    const legend = screen.getByTestId('chart-legend').textContent?.toLowerCase() ?? ''
    for (const label of ['complete', 'in progress', 'not cached']) {
      expect(legend).toContain(label)
    }
  })
})
