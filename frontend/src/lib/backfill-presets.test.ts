import { describe, expect, it } from 'vitest'
import { presetRange, PRESETS } from './backfill-presets'

// Data-page redesign: preset chips fill the backfill date range.

const TODAY = '2026-06-04'

describe('presetRange', () => {
  it('last 30 days', () => {
    expect(presetRange('last30', TODAY)).toEqual({ start: '2026-05-05', end: TODAY })
  })

  it('last 90 days', () => {
    expect(presetRange('last90', TODAY)).toEqual({ start: '2026-03-06', end: TODAY })
  })

  it('year to date', () => {
    expect(presetRange('ytd', TODAY)).toEqual({ start: '2026-01-01', end: TODAY })
  })

  it('full history starts at the archive floor', () => {
    expect(presetRange('full', TODAY)).toEqual({ start: '2018-01-01', end: TODAY })
  })

  it('exposes the four chips in display order', () => {
    expect(PRESETS.map((p) => p.key)).toEqual(['last30', 'last90', 'ytd', 'full'])
  })
})
