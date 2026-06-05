// T020 (Feature 014, FR-007/FR-011) — expandable walk-forward window rows
// (Option B from the approved design): collapsed = OOS verdict; expanded =
// IS/OOS detail pair, each with "View run →" gated on `persisted`.
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WindowRows } from './WindowRows'
import type { WalkForwardResult } from '@/api/types'

function wm(over: Record<string, unknown> = {}) {
  return {
    segment: 'validation', range_start: '2019-01-02', range_end: '2019-03-29',
    run_id: 'run-oos-1', persisted: true, total_trades: 54, expectancy_dollars: 0.11,
    expectancy_r: 0.01, win_rate: 0.49, profit_factor: 1.2, sharpe: 0.3,
    total_net_pnl_dollars: 118, low_confidence: false, ...over,
  }
}

function result(windows: WalkForwardResult['windows']): WalkForwardResult {
  return {
    mode: 'rolling', train_months: 12, step_months: 3, validation_months: 3,
    windows, mean_oos: {}, mean_gap: {},
  } as WalkForwardResult
}

const TWO_WINDOWS = result([
  {
    window_index: 0,
    in_sample: wm({ segment: 'train', run_id: 'run-is-0', expectancy_dollars: 0.12 }) as never,
    out_of_sample: wm({ run_id: 'run-oos-0', expectancy_dollars: 0.11 }) as never,
    gap: { expectancy_r: 0.01, expectancy_dollars: -0.01 },
  },
  {
    window_index: 1,
    in_sample: wm({ segment: 'train', run_id: 'run-is-1' }) as never,
    out_of_sample: wm({ run_id: 'run-oos-1', low_confidence: true, total_trades: 12 }) as never,
    gap: { expectancy_r: 0.05, expectancy_dollars: 0.02 },
  },
])

describe('WindowRows', () => {
  it('renders one collapsed row per window with the OOS verdict', () => {
    render(<WindowRows result={TWO_WINDOWS} />)
    const row0 = screen.getByTestId('window-row-0')
    expect(row0.textContent).toMatch(/window 0/i)
    expect(row0.textContent).toContain('+$0.11')          // OOS expectancy
    expect(row0.textContent).toContain('54')              // trades
    expect(screen.queryByTestId('window-detail-0')).not.toBeInTheDocument()
  })

  it('flags low-confidence windows', () => {
    render(<WindowRows result={TWO_WINDOWS} />)
    expect(screen.getByTestId('window-row-1').textContent).toContain('⚠')
  })

  it('expands to the IS/OOS detail pair with run links for persisted evals', () => {
    render(<WindowRows result={TWO_WINDOWS} />)
    fireEvent.click(screen.getByTestId('window-row-0'))
    const detail = screen.getByTestId('window-detail-0')
    expect(detail.textContent).toMatch(/in-sample/i)
    expect(detail.textContent).toMatch(/out-of-sample/i)
    const links = screen.getAllByRole('link', { name: /view run/i })
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute('href', '/runs/run-is-0')
    expect(links[1]).toHaveAttribute('href', '/runs/run-oos-0')
  })

  it('hides run links when persisted is false or absent (pre-014 studies)', () => {
    const old = result([
      {
        window_index: 0,
        in_sample: wm({ run_id: 'x', persisted: undefined }) as never,
        out_of_sample: wm({ run_id: 'y', persisted: false }) as never,
        gap: {},
      },
    ])
    render(<WindowRows result={old} />)
    fireEvent.click(screen.getByTestId('window-row-0'))
    expect(screen.getByTestId('window-detail-0')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /view run/i })).not.toBeInTheDocument()
  })

  it('ships the drill-down help tooltip (constitution VI)', () => {
    render(<WindowRows result={TWO_WINDOWS} />)
    expect(screen.getByLabelText(/help: study drill-down/i)).toBeInTheDocument()
  })
})
