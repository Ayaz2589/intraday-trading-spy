import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CacheHeatmap } from './CacheHeatmap'
import type { MonthStat } from '@/api/bars'

// T015/T020 (Feature 013 US2/US3): heatmap cell states, legend, and the
// partial-cell hover that lists the EXACT missing trading days.

function m(month: string, state: MonthStat['state'], over: Partial<MonthStat> = {}): MonthStat {
  return {
    month,
    state,
    sessions_present: state === 'complete' ? 20 : state === 'partial' ? 19 : 0,
    sessions_expected: state === 'future' ? 0 : 20,
    bars: state === 'future' ? 0 : 1560,
    sources: state === 'future' ? [] : ['alpaca'],
    missing_dates: [],
    ...over,
  }
}

describe('CacheHeatmap', () => {
  it('renders one cell per month with its state (complete/partial/current/future)', () => {
    render(
      <CacheHeatmap
        months={[
          m('2026-03', 'complete'),
          m('2026-04', 'partial', { missing_dates: ['2026-04-09'] }),
          m('2026-05', 'future'),
          m('2026-06', 'current', { sessions_present: 3, sessions_expected: 3 }),
        ]}
      />,
    )
    expect(screen.getByTestId('heatcell-2026-03')).toHaveAttribute('data-state', 'complete')
    expect(screen.getByTestId('heatcell-2026-04')).toHaveAttribute('data-state', 'partial')
    expect(screen.getByTestId('heatcell-2026-05')).toHaveAttribute('data-state', 'future')
    expect(screen.getByTestId('heatcell-2026-06')).toHaveAttribute('data-state', 'current')
  })

  it('partial cell hover reveals the exact missing trading days (US3)', () => {
    render(<CacheHeatmap months={[m('2026-04', 'partial', { missing_dates: ['2026-04-09', '2026-04-10'] })]} />)
    const cell = screen.getByTestId('heatcell-2026-04')
    expect(cell.getAttribute('title')).toContain('2026-04-09')
    expect(cell.getAttribute('title')).toContain('2026-04-10')
    expect(cell.getAttribute('title')).toMatch(/missing/i)
  })

  it('complete cell hover shows sessions and bars, not "missing"', () => {
    render(<CacheHeatmap months={[m('2026-03', 'complete')]} />)
    const title = screen.getByTestId('heatcell-2026-03').getAttribute('title') ?? ''
    expect(title).toContain('20/20')
    expect(title).not.toMatch(/missing/i)
  })

  it('renders a legend explaining the four states', () => {
    render(<CacheHeatmap months={[m('2026-03', 'complete')]} />)
    const legend = screen.getByTestId('heatmap-legend')
    for (const label of ['complete', 'partial', 'current', 'future']) {
      expect(legend.textContent?.toLowerCase()).toContain(label)
    }
  })

  it('spans year rows from the first to the last month', () => {
    render(<CacheHeatmap months={[m('2025-11', 'complete'), m('2025-12', 'complete'), m('2026-01', 'current')]} />)
    expect(screen.getByTestId('heatrow-2025')).toBeInTheDocument()
    expect(screen.getByTestId('heatrow-2026')).toBeInTheDocument()
  })
})
