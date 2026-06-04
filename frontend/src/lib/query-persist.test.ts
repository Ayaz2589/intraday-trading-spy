import { describe, expect, it } from 'vitest'
import { shouldPersistQuery } from './query-persist'
import type { Query } from '@tanstack/react-query'

// Feature 013 perf: only the Data page's read-only snapshots are persisted to
// localStorage for instant paint on reload (stale-while-revalidate). Volatile
// or sensitive queries (job polling, runs, auth-adjacent data) must NOT be.

function q(queryKey: unknown[], status: 'success' | 'error' = 'success'): Query {
  return { queryKey, state: { status } } as unknown as Query
}

describe('shouldPersistQuery', () => {
  it('persists the Data page snapshots', () => {
    expect(shouldPersistQuery(q(['bars', 'stats']))).toBe(true)
    expect(shouldPersistQuery(q(['bars', 'jobs']))).toBe(true)
    expect(shouldPersistQuery(q(['bars', 'coverage']))).toBe(true)
  })

  it('does not persist per-job polling queries', () => {
    expect(shouldPersistQuery(q(['bars', 'backfill', 'job-1']))).toBe(false)
  })

  it('does not persist non-bars queries (runs, configs, studies…)', () => {
    expect(shouldPersistQuery(q(['runs', 'list']))).toBe(false)
    expect(shouldPersistQuery(q(['configs', 'list']))).toBe(false)
  })

  it('does not persist failed queries', () => {
    expect(shouldPersistQuery(q(['bars', 'stats'], 'error'))).toBe(false)
  })
})
