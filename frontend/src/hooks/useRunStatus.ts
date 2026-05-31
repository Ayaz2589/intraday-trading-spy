import { useQuery } from '@tanstack/react-query'
import { getRunStatus } from '@/api/runs'
import { adaptivePollingInterval } from '@/lib/polling'
import type { RunStatusResponse, UUID } from '@/api/types'

export function runStatusQueryKey(runId: UUID): readonly unknown[] {
  return ['runs', 'status', runId] as const
}

export function useRunStatus(runId: UUID | undefined) {
  return useQuery<RunStatusResponse>({
    queryKey: runStatusQueryKey(runId ?? ''),
    queryFn: () => getRunStatus(runId as UUID),
    enabled: !!runId,
    refetchInterval: query => adaptivePollingInterval(query),
    refetchOnWindowFocus: false,
  })
}
