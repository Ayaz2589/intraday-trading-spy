// Feature 022 — buildReplayMarkers: journal events → hover-ready chart markers.
import { describe, it, expect } from 'vitest'
import { buildReplayMarkers } from './replay-markers'
import type { PaperEvent } from '@/api/trade'

function ev(kind: string, payload: Record<string, unknown>, seq = 1): PaperEvent {
  return { seq, trading_day: '2026-05-26', timestamp: '2026-05-26T13:35:00+00:00', kind, payload }
}

describe('buildReplayMarkers', () => {
  it('makes an entry marker from an executed event', () => {
    const m = buildReplayMarkers([
      ev('executed', { actual_entry: 531.2, quantity: 25, stop_loss: 530.1, take_profit: 533.4, origin: 'strategy' }),
    ])
    expect(m).toHaveLength(1)
    expect(m[0].tone).toBe('entry')
    expect(m[0].value).toBe(531.2)
    expect(m[0].title).toBe('Entry')
    expect(m[0].rows).toContainEqual(['Entry', '$531.20'])
    expect(m[0].rows).toContainEqual(['Stop', '$530.10'])
  })

  it('colors a winning exit profit and a losing exit loss', () => {
    const win = buildReplayMarkers([ev('exited', { actual_exit: 533.4, realized_r: 1.0, exit_reason: 'target', gross_pnl: 55 })])
    const lose = buildReplayMarkers([ev('exited', { actual_exit: 530.1, realized_r: -1.0, exit_reason: 'stop', gross_pnl: -27 })])
    expect(win[0].tone).toBe('profit')
    expect(win[0].title).toBe('Exit · target')
    expect(lose[0].tone).toBe('loss')
  })

  it('marks force-flat muted and manual close as Manual close', () => {
    const ff = buildReplayMarkers([ev('force_flat', { actual_exit: 531.0, realized_r: 0.1, exit_reason: 'force_flat' })])
    expect(ff[0].tone).toBe('muted')
    const manual = buildReplayMarkers([ev('force_flat', { actual_exit: 531.0, realized_r: 0.1, exit_reason: 'manual' })])
    expect(manual[0].title).toBe('Manual close')
  })

  it('makes rejection + window-skip markers with a reason', () => {
    const m = buildReplayMarkers([
      ev('rejected', { vwap: 530.0, rejection_check: 'position_already_open' }, 1),
      ev('skipped_window', { vwap: 530.2, reason: 'outside [0,30)' }, 2),
    ])
    expect(m.map((x) => x.title)).toEqual(['Rejected', 'Skipped — entry window'])
    expect(m[0].rows).toContainEqual(['Why', 'position_already_open'])
  })

  it('skips bookkeeping events and unanchorable markers', () => {
    const m = buildReplayMarkers([
      ev('emitted', { planned_entry: 1 }),
      ev('approved', {}),
      ev('session_started', {}),
      ev('replay_completed', {}),
      ev('rejected', {}), // no vwap/planned_entry → cannot anchor
    ])
    expect(m).toEqual([])
  })
})
