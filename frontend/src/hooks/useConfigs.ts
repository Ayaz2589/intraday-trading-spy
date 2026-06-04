import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  activateConfig,
  createConfig,
  deleteConfig,
  duplicateConfig,
  listConfigs,
  listPresets,
  patchConfig,
  type ConfigListResponse,
  type CreateConfigBody,
  type PresetListResponse,
} from '@/api/configs'
import type { UUID } from '@/api/types'

export function configsQueryKey(): readonly unknown[] {
  return ['configs', 'list'] as const
}

export function presetsQueryKey(): readonly unknown[] {
  return ['configs', 'presets'] as const
}

export function useConfigs() {
  return useQuery<ConfigListResponse>({
    queryKey: configsQueryKey(),
    queryFn: () => listConfigs(),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function usePresets() {
  return useQuery<PresetListResponse>({
    queryKey: presetsQueryKey(),
    queryFn: () => listPresets(),
    // Presets are version-controlled files — they don't change at runtime.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

// Every config mutation invalidates the configs list AND runs: the run-manifest
// caches a config snapshot, and activation/rename changes which config a picker
// pre-selects.
function useConfigMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: configsQueryKey() })
      client.invalidateQueries({ queryKey: ['runs'] })
    },
  })
}

export function useUpdateConfig() {
  return useConfigMutation((vars: { id: UUID; params: Record<string, unknown> }) =>
    patchConfig(vars.id, { params: vars.params }),
  )
}

export function useCreateConfig() {
  return useConfigMutation((body: CreateConfigBody) => createConfig(body))
}

export function useDuplicateConfig() {
  return useConfigMutation((vars: { id: UUID; name: string }) =>
    duplicateConfig(vars.id, vars.name),
  )
}

export function useActivateConfig() {
  return useConfigMutation((id: UUID) => activateConfig(id))
}

export function useRenameConfig() {
  return useConfigMutation((vars: { id: UUID; name: string }) =>
    patchConfig(vars.id, { name: vars.name }),
  )
}

export function useDeleteConfig() {
  return useConfigMutation((id: UUID) => deleteConfig(id))
}
