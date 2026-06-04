import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CacheSummary } from './CacheSummary'
import type { BarsStatsResponse } from '@/api/bars'

// T015/T020/T024 (Feature 013 US2/US3/US4): totals strip, the explicit
// "no missing sessions" indication, and the light lineage line.

function stats(over: Partial<BarsStatsResponse> = {}): BarsStatsResponse {
  return {
    totals: {
      bars: 164919,
      sessions: 2118,
      earliest: '2018-01-02',
      latest: '2026-06-04',
      last_updated: '2026-06-04T15:02:11Z',
      sources: ['alpaca'],
    },
    months: [
      {
        month: '2026-05', state: 'complete', sessions_present: 20,
        sessions_expected: 20, bars: 1560, sources: ['alpaca'], missing_dates: [],
      },
    ],
    lineage: { runs_count: 47, studies_count: 14, latest_run_at: '2026-06-04T14:11:09Z' },
    ...over,
  }
}

describe('CacheSummary', () => {
  it('shows totals: bars, sessions, span, source and last-updated (US2)', () => {
    render(<CacheSummary stats={stats()} />)
    const strip = screen.getByTestId('cache-summary')
    expect(strip.textContent).toContain('164,919')
    expect(strip.textContent).toContain('2,118')
    expect(strip.textContent).toContain('2018-01-02')
    expect(strip.textContent).toContain('2026-06-04')
    expect(strip.textContent).toContain('alpaca')
  })

  it('says explicitly when no sessions are missing (US3 / SC-004)', () => {
    render(<CacheSummary stats={stats()} />)
    expect(screen.getByTestId('missing-summary').textContent).toMatch(/no missing sessions/i)
  })

  it('counts the missing days when there are gaps (US3)', () => {
    const s = stats()
    s.months = [
      { ...s.months[0], state: 'partial', sessions_present: 18, missing_dates: ['2026-05-07', '2026-05-08'] },
    ]
    render(<CacheSummary stats={s} />)
    expect(screen.getByTestId('missing-summary').textContent).toMatch(/2 missing trading day/i)
  })

  it('renders the lineage line with counts and a link to the Runs page (US4 / SC-007)', () => {
    render(<CacheSummary stats={stats()} />)
    const line = screen.getByTestId('lineage-line')
    expect(line.textContent).toContain('47')
    expect(line.textContent).toContain('14')
    const link = screen.getByRole('link', { name: /runs/i })
    expect(link).toHaveAttribute('href', '/runs')
  })

  it('degrades gracefully with zero runs (US4)', () => {
    const s = stats()
    s.lineage = { runs_count: 0, studies_count: 0, latest_run_at: null }
    render(<CacheSummary stats={s} />)
    expect(screen.getByTestId('lineage-line').textContent).toMatch(/no backtests yet/i)
  })
})
