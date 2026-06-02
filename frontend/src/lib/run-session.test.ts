import { describe, it, expect } from 'vitest'
import { resolveSession } from './run-session'

describe('resolveSession', () => {
  it('keeps the picked session when it is valid for the current run', () => {
    expect(resolveSession(['2026-05-28', '2026-05-29'], '2026-05-29')).toBe('2026-05-29')
  })

  it('falls back to the first session when the picked one is stale (after switching runs)', () => {
    // Picked a session from a previous run that does not exist in this run's bars.
    expect(resolveSession(['2026-05-28', '2026-05-29'], '2026-06-01')).toBe('2026-05-28')
  })

  it('uses the first session when none is picked yet', () => {
    expect(resolveSession(['2026-05-28'], null)).toBe('2026-05-28')
  })

  it('returns null when there are no sessions', () => {
    expect(resolveSession([], '2026-05-28')).toBeNull()
  })
})
