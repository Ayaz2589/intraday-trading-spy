import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import { listSignals } from '@/api/runs'
import type { SignalListResponse, UUID } from '@/api/types'

const PAGE_LIMIT = 100

export function useRunSignals(runId: UUID | undefined, opts: { executed?: boolean } = {}) {
  return useInfiniteQuery<SignalListResponse>({
    queryKey: ['runs', 'signals', runId ?? '', opts.executed ?? 'all'],
    queryFn: ({ pageParam }) =>
      listSignals(runId as UUID, {
        executed: opts.executed,
        limit: PAGE_LIMIT,
        cursor: typeof pageParam === 'string' ? pageParam : undefined,
      }),
    enabled: !!runId,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: SignalListResponse) => last.next_cursor ?? undefined,
    refetchOnWindowFocus: false,
  })
}

export function flattenSignals(data: InfiniteData<SignalListResponse> | undefined) {
  return data?.pages.flatMap(p => p.signals) ?? []
}
