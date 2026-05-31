import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listConfigs, patchConfig, type ConfigListResponse } from '@/api/configs'
import type { UUID } from '@/api/types'

export function configsQueryKey(): readonly unknown[] {
  return ['configs', 'list'] as const
}

export function useConfigs() {
  return useQuery<ConfigListResponse>({
    queryKey: configsQueryKey(),
    queryFn: () => listConfigs(),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useUpdateConfig() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: UUID; params: Record<string, unknown> }) =>
      patchConfig(vars.id, vars.params),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: configsQueryKey() })
      // Run-manifest caches a snapshot of the config — invalidate so the
      // detail page picks up the new shape.
      client.invalidateQueries({ queryKey: ['runs'] })
    },
  })
}
