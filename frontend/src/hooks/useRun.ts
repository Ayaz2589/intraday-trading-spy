import { useQuery } from '@tanstack/react-query'
import { getRun } from '@/api/runs'
import { adaptivePollingInterval } from '@/lib/polling'
import type { Run, UUID } from '@/api/types'

export function runQueryKey(runId: UUID): readonly unknown[] {
  return ['runs', 'detail', runId] as const
}

export function useRun(runId: UUID | undefined) {
  return useQuery<Run>({
    queryKey: runQueryKey(runId ?? ''),
    queryFn: () => getRun(runId as UUID),
    enabled: !!runId,
    refetchInterval: query => adaptivePollingInterval(query),
    refetchOnWindowFocus: false,
  })
}
