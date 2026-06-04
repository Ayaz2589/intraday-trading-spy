import { describe, expect, it } from 'vitest'
import { estimateWindows, estimateDurationMs, formatMs, jobStats } from './backfill-estimate'
import type { BackfillJobView } from '@/api/bars'

// Data-page redesign: pre-launch estimate ("N windows · est 1m 40s") and the
// job-history stats row, derived purely from the jobs the page already has.

function job(over: Partial<BackfillJobView>): BackfillJobView {
  return {
    job_id: 'j', status: 'finished', source: 'alpaca',
    range_start: '2018-01-01', range_end: '2026-06-04',
    windows_total: 103, windows_done: 103, bars_added: 1,
    gap_session_dates: [], failure_reason: null,
    created_at: '2026-06-04T14:00:00Z', updated_at: '2026-06-04T14:01:43Z',
    ...over,
  }
}

describe('estimateWindows', () => {
  it('full history = 103 windows (3,077 days / 30)', () => {
    expect(estimateWindows('2018-01-01', '2026-06-04')).toBe(103)
  })
  it('a single month = 1 window', () => {
    expect(estimateWindows('2026-05-05', '2026-06-03')).toBe(1)
  })
  it('invalid range = 0', () => {
    expect(estimateWindows('2026-06-04', '2026-01-01')).toBe(0)
  })
})

describe('estimateDurationMs', () => {
  it('uses the median per-window pace of finished jobs', () => {
    const jobs = [
      job({ created_at: '2026-06-04T14:00:00Z', updated_at: '2026-06-04T14:01:43Z' }), // 103s/103w = 1s/w
      job({ created_at: '2026-06-04T15:00:00Z', updated_at: '2026-06-04T15:05:09Z' }), // 309s/103w = 3s/w
      job({ created_at: '2026-06-04T16:00:00Z', updated_at: '2026-06-04T16:03:26Z' }), // 206s/103w = 2s/w
    ]
    expect(estimateDurationMs(jobs, 50)).toBe(50 * 2000) // median pace 2s/window
  })

  it('ignores failed and zero-window jobs; null without history', () => {
    expect(estimateDurationMs([job({ status: 'failed', windows_done: 0 })], 50)).toBeNull()
    expect(estimateDurationMs([], 10)).toBeNull()
  })
})

describe('formatMs', () => {
  it('formats seconds and minutes', () => {
    expect(formatMs(4000)).toBe('4s')
    expect(formatMs(100000)).toBe('1m 40s')
  })
})

describe('jobStats', () => {
  it('totals the shown jobs', () => {
    const jobs = [
      job({ bars_added: 92 }),
      job({ bars_added: 61 }),
      job({ status: 'failed', bars_added: 0 }),
    ]
    expect(jobStats(jobs)).toEqual({ total: 3, finished: 2, failed: 1, barsAdded: 153 })
  })
})
