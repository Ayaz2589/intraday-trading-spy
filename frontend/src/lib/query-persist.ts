import type { Query } from '@tanstack/react-query'

// Feature 013 perf: stale-while-revalidate for the Data page. The last
// successful snapshot of these read-only queries is persisted to localStorage
// so the page paints instantly on reload, then refetches in the background and
// swaps in any changes. Scope is deliberately narrow:
//   - ['bars','stats'] / ['bars','jobs'] / ['bars','coverage'] — cheap to show
//     stale (data only changes when a backfill runs, which already invalidates
//     these), and expensive to recompute.
//   - NOT ['bars','backfill',<jobId>] — live polling state, must stay fresh.
//   - NOT runs/configs/studies — mutable research state; always fetch fresh.
export function shouldPersistQuery(query: Query): boolean {
  if (query.state.status !== 'success') return false
  const key = query.queryKey
  if (key[0] !== 'bars') return false
  return key[1] === 'stats' || key[1] === 'jobs' || key[1] === 'coverage'
}
