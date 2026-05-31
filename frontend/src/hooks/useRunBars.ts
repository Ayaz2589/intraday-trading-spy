import { useQuery } from '@tanstack/react-query'
import { listBars } from '@/api/runs'
import type { BarListResponse, UUID } from '@/api/types'

export function runBarsQueryKey(runId: UUID): readonly unknown[] {
  return ['runs', 'detail', runId, 'bars'] as const
}

export function useRunBars(runId: UUID | undefined) {
  return useQuery<BarListResponse>({
    queryKey: runBarsQueryKey(runId ?? ''),
    queryFn: () => listBars(runId as UUID),
    enabled: !!runId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
