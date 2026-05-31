import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { listRuns } from '@/api/runs'
import { POLLING_LIST_MS } from '@/config'
import type { RunListResponse } from '@/api/types'

const PAGE_LIMIT = 50

export function runsQueryKey(): readonly unknown[] {
  return ['runs', 'list'] as const
}

export function useRuns() {
  return useInfiniteQuery<RunListResponse>({
    queryKey: runsQueryKey(),
    queryFn: ({ pageParam }) =>
      listRuns({
        limit: PAGE_LIMIT,
        cursor: typeof pageParam === 'string' ? pageParam : undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: RunListResponse): string | undefined =>
      last.next_cursor ?? undefined,
    refetchInterval: POLLING_LIST_MS,
    refetchOnWindowFocus: false,
  })
}

/** Flatten infinite-query pages into a single array of runs. */
export function flattenRuns(data: InfiniteData<RunListResponse> | undefined) {
  return data?.pages.flatMap(p => p.runs) ?? []
}

export function useInvalidateRuns() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: runsQueryKey() })
}
