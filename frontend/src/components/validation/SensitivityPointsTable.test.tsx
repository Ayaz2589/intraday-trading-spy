// T021 (Feature 014, FR-007/FR-011) — sensitivity grid-points table with
// per-point run links gated on `persisted`.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SensitivityPointsTable } from './SensitivityPointsTable'
import type { SensitivitySurface } from '@/api/types'

const RR = 'strategy.vwap_pullback.target.risk_reward'

function surface(points: SensitivitySurface['points']): SensitivitySurface {
  return {
    metric_name: 'expectancy_dollars', knobs: [RR],
    axes: { [RR]: [1.5, 2.0] }, points, segment: 'train',
  } as SensitivitySurface
}

describe('SensitivityPointsTable', () => {
  it('renders a row per point with coords, metric, and trades', () => {
    render(
      <SensitivityPointsTable
        surface={surface([
          { coords: { [RR]: 1.5 }, metric: 0.42, trade_count: 40, low_confidence: false, run_id: 'p1', persisted: true },
          { coords: { [RR]: 2.0 }, metric: null, trade_count: 0, low_confidence: true, run_id: 'p2', persisted: true },
        ])}
      />,
    )
    const rows = screen.getAllByTestId(/point-row-/)
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('1.5')
    expect(rows[0].textContent).toContain('0.42')
    expect(rows[0].textContent).toContain('40')
    expect(rows[1].textContent).toContain('—')   // null metric
    expect(rows[1].textContent).toContain('⚠')   // low confidence
  })

  it('links each persisted point to its run, hides links otherwise', () => {
    render(
      <SensitivityPointsTable
        surface={surface([
          { coords: { [RR]: 1.5 }, metric: 0.4, trade_count: 40, low_confidence: false, run_id: 'p1', persisted: true },
          { coords: { [RR]: 2.0 }, metric: 0.6, trade_count: 41, low_confidence: false, run_id: 'p2' } as never,
        ])}
      />,
    )
    const links = screen.getAllByRole('link', { name: /view run/i })
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/runs/p1')
  })
})
