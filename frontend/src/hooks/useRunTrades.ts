import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import { listTrades } from '@/api/runs'
import type { TradeListResponse, UUID } from '@/api/types'

const PAGE_LIMIT = 100

export function useRunTrades(runId: UUID | undefined) {
  return useInfiniteQuery<TradeListResponse>({
    queryKey: ['runs', 'trades', runId ?? ''],
    queryFn: ({ pageParam }) =>
      listTrades(runId as UUID, {
        limit: PAGE_LIMIT,
        cursor: typeof pageParam === 'string' ? pageParam : undefined,
      }),
    enabled: !!runId,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: TradeListResponse) => last.next_cursor ?? undefined,
    refetchOnWindowFocus: false,
  })
}

export function flattenTrades(data: InfiniteData<TradeListResponse> | undefined) {
  return data?.pages.flatMap(p => p.trades) ?? []
}
