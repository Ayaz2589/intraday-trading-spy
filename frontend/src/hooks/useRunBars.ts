import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { listBars, listRunSessions } from '@/api/runs'
import type { BarListResponse, UUID } from '@/api/types'

// Run-viewer session scale fix (post-014): bars load ONE session at a time
// (~78 bars) instead of the run's whole range (a year-long study child is
// ~20k bars). Visited sessions stay cached; adjacent sessions are prefetched
// so arrow-stepping feels instant.

const STALE_MS = 5 * 60 * 1000

export function runBarsQueryKey(runId: UUID, session?: string): readonly unknown[] {
  return ['runs', 'detail', runId, 'bars', session ?? 'all'] as const
}

export function runSessionsQueryKey(runId: UUID): readonly unknown[] {
  return ['runs', 'detail', runId, 'sessions'] as const
}

export function useRunSessions(runId: UUID | undefined) {
  return useQuery<{ sessions: string[] }>({
    queryKey: runSessionsQueryKey(runId ?? ''),
    queryFn: () => listRunSessions(runId as UUID),
    enabled: !!runId,
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
  })
}

export function useRunBars(runId: UUID | undefined, session?: string) {
  return useQuery<BarListResponse>({
    queryKey: runBarsQueryKey(runId ?? '', session),
    queryFn: () => listBars(runId as UUID, session ? { session } : {}),
    // Bars wait for a resolved session — the page never pulls the full range.
    enabled: !!runId && !!session,
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
  })
}

/** Warm the cache for the sessions adjacent to the selected one. */
export function usePrefetchAdjacentSessions(
  runId: UUID | undefined,
  sessions: string[],
  selected: string | null,
) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!runId || !selected) return
    const idx = sessions.indexOf(selected)
    for (const neighbor of [sessions[idx - 1], sessions[idx + 1]]) {
      if (!neighbor) continue
      queryClient.prefetchQuery({
        queryKey: runBarsQueryKey(runId, neighbor),
        queryFn: () => listBars(runId, { session: neighbor }),
        staleTime: STALE_MS,
      })
    }
  }, [runId, sessions, selected, queryClient])
}
