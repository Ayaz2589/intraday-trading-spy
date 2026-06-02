import { describe, it, expect } from 'vitest'
import { addDays, maxEndForStart, clampEnd, minIso, MAX_RANGE_DAYS } from './date-range'

describe('date-range', () => {
  it('caps the window at 5 inclusive days', () => {
    expect(MAX_RANGE_DAYS).toBe(5)
  })

  it('addDays advances calendar dates across month boundaries (UTC, DST-safe)', () => {
    expect(addDays('2026-04-01', 4)).toBe('2026-04-05')
    expect(addDays('2026-04-29', 4)).toBe('2026-05-03')
    expect(addDays('2026-04-05', -4)).toBe('2026-04-01')
  })

  it('maxEndForStart caps the end 4 days after start (Apr 1 -> Apr 5)', () => {
    expect(maxEndForStart('2026-04-01')).toBe('2026-04-05')
  })

  it('clampEnd keeps an end that is already within the window', () => {
    expect(clampEnd('2026-04-01', '2026-04-03')).toBe('2026-04-03')
    expect(clampEnd('2026-04-01', '2026-04-05')).toBe('2026-04-05')
  })

  it('clampEnd pulls an end beyond +4 days back to the cap', () => {
    expect(clampEnd('2026-04-01', '2026-04-10')).toBe('2026-04-05')
  })

  it('clampEnd raises an end before the start up to the start', () => {
    expect(clampEnd('2026-04-01', '2026-03-28')).toBe('2026-04-01')
  })

  it('minIso returns the earlier ISO date', () => {
    expect(minIso('2026-04-05', '2026-04-03')).toBe('2026-04-03')
    expect(minIso('2026-04-03', '2026-04-05')).toBe('2026-04-03')
  })
})
