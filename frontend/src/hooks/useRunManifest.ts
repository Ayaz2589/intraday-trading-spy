import { useQuery } from '@tanstack/react-query'
import { getManifest } from '@/api/runs'
import type { RunManifestResponse, UUID } from '@/api/types'

export function runManifestQueryKey(runId: UUID): readonly unknown[] {
  return ['runs', 'detail', runId, 'manifest'] as const
}

export function useRunManifest(runId: UUID | undefined) {
  return useQuery<RunManifestResponse>({
    queryKey: runManifestQueryKey(runId ?? ''),
    queryFn: () => getManifest(runId as UUID),
    enabled: !!runId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
