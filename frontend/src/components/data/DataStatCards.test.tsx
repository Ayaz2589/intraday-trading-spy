import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DataStatCards } from './DataStatCards'
import { StatusStrip } from './StatusStrip'
import type { BarsStatsResponse } from '@/api/bars'

// Data-page redesign: the 4 stat cards + the status strip (replace the old
// CacheSummary; its guarantees are ported here).

function stats(over: Partial<BarsStatsResponse> = {}): BarsStatsResponse {
  return {
    totals: {
      bars: 168424,
      sessions: 2117,
      earliest: '2018-01-02',
      latest: '2026-06-04',
      last_updated: '2026-06-04T20:05:39Z',
      sources: ['alpaca', 'yfinance'],
    },
    months: [
      { month: '2026-05', state: 'complete', sessions_present: 20, sessions_expected: 20, bars: 1560, sources: ['alpaca'], missing_dates: [] },
    ],
    lineage: { runs_count: 47, studies_count: 14, latest_run_at: '2026-06-04T14:11:09Z' },
    ...over,
  }
}

describe('DataStatCards', () => {
  it('shows bars, sessions and the coverage span', () => {
    render(<DataStatCards stats={stats()} />)
    const cards = screen.getByTestId('stat-cards')
    expect(cards.textContent).toContain('168,424')
    expect(cards.textContent).toContain('2,117')
    expect(cards.textContent).toContain('2018-01-02')
    expect(cards.textContent).toContain('2026-06-04')
  })

  it('labels the first source primary and others fallback', () => {
    render(<DataStatCards stats={stats()} />)
    expect(screen.getByTestId('source-alpaca').textContent).toMatch(/primary/i)
    expect(screen.getByTestId('source-yfinance').textContent).toMatch(/fallback/i)
  })
})

describe('StatusStrip', () => {
  it('says explicitly when no sessions are missing (SC-004)', () => {
    render(<StatusStrip stats={stats()} />)
    expect(screen.getByTestId('missing-summary').textContent).toMatch(/no missing sessions/i)
  })

  it('counts the missing days when there are gaps', () => {
    const s = stats()
    s.months = [{ ...s.months[0], state: 'partial', sessions_present: 18, missing_dates: ['2026-05-07', '2026-05-08'] }]
    render(<StatusStrip stats={s} />)
    expect(screen.getByTestId('missing-summary').textContent).toMatch(/2 missing trading day/i)
  })

  it('shows symbol, interval and last-updated', () => {
    render(<StatusStrip stats={stats()} />)
    const strip = screen.getByTestId('status-strip')
    expect(strip.textContent).toContain('SPY')
    expect(strip.textContent).toContain('5 min')
  })

  it('renders the lineage line with counts and a Runs link (SC-007)', () => {
    render(<StatusStrip stats={stats()} />)
    const line = screen.getByTestId('lineage-line')
    expect(line.textContent).toContain('47')
    expect(line.textContent).toContain('14')
    expect(screen.getByRole('link', { name: /runs/i })).toHaveAttribute('href', '/runs')
  })

  it('degrades gracefully with zero runs', () => {
    const s = stats()
    s.lineage = { runs_count: 0, studies_count: 0, latest_run_at: null }
    render(<StatusStrip stats={s} />)
    expect(screen.getByTestId('lineage-line').textContent).toMatch(/no backtests yet/i)
  })
})
