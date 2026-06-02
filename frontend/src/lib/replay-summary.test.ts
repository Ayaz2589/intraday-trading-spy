import { describe, it, expect } from 'vitest'
import { computeReplaySummary } from './replay-summary'
import type { JournalRowView } from '@/api/legacy-types'

function row(over: Partial<JournalRowView>): JournalRowView {
  return {
    row_seq: 0,
    timestamp: '2026-04-01T13:30:00Z',
    status: 'executed',
    reason: '',
    ...over,
  } as JournalRowView
}

describe('computeReplaySummary', () => {
  it('returns zeros for an empty journal', () => {
    expect(computeReplaySummary([])).toMatchObject({
      pnl: '0',
      win_rate: 0,
      total_trades: 0,
      total_signals: 0,
      rejected_signals: 0,
    })
  })

  it('aggregates revealed trades and signals', () => {
    const rows = [
      row({ status: 'executed' }),
      row({ status: 'exited', exit_reason: 'target', realized_pnl: 120.5, realized_r: 1 }),
      row({ status: 'executed' }),
      row({ status: 'exited', exit_reason: 'stop', realized_pnl: -60.25, realized_r: -1 }),
      row({ status: 'rejected' }),
    ]
    const s = computeReplaySummary(rows)
    expect(s.total_trades).toBe(2) // executed count
    expect(s.win_rate).toBeCloseTo(0.5) // 1 win / 2 trades
    expect(Number(s.pnl)).toBeCloseTo(60.25) // 120.5 - 60.25
    expect(s.total_signals).toBe(3) // 2 executed + 1 rejected
    expect(s.rejected_signals).toBe(1)
  })

  it('computes max drawdown in R over completed trades', () => {
    const rows = [
      row({ status: 'exited', exit_reason: 'target', realized_r: 2, realized_pnl: 200 }),
      row({ status: 'exited', exit_reason: 'stop', realized_r: -1, realized_pnl: -100 }),
      row({ status: 'exited', exit_reason: 'stop', realized_r: -1, realized_pnl: -100 }),
    ]
    // cumulative R: 2, 1, 0 → peak 2 → max drawdown -2
    expect(Number(computeReplaySummary(rows).max_drawdown)).toBeCloseTo(-2)
  })
})
