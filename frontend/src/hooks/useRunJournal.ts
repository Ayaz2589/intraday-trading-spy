import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import { listJournal } from '@/api/runs'
import type { JournalListResponse, UUID } from '@/api/types'

const PAGE_LIMIT = 200

export function useRunJournal(runId: UUID | undefined) {
  return useInfiniteQuery<JournalListResponse>({
    queryKey: ['runs', 'journal', runId ?? ''],
    queryFn: ({ pageParam }) =>
      listJournal(runId as UUID, {
        limit: PAGE_LIMIT,
        cursor: typeof pageParam === 'string' ? pageParam : undefined,
      }),
    enabled: !!runId,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: JournalListResponse) => last.next_cursor ?? undefined,
    refetchOnWindowFocus: false,
  })
}

export function flattenJournal(data: InfiniteData<JournalListResponse> | undefined) {
  return data?.pages.flatMap(p => p.events) ?? []
}
