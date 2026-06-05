import { apiRequest } from './client'
import type { Config, ConfigSource, Preset, UUID } from './types'

export type ConfigListResponse = { configs: Config[] }
export type PresetListResponse = { presets: Preset[] }

export function listConfigs(): Promise<ConfigListResponse> {
  return apiRequest<ConfigListResponse>('/api/configs')
}

export function listPresets(): Promise<PresetListResponse> {
  return apiRequest<PresetListResponse>('/api/configs/presets')
}

export type CreateConfigBody = {
  name: string
  source?: ConfigSource
  preset_name?: string
  from_config_id?: UUID
  params?: Record<string, unknown>
  // Feature 017 — durable provenance for drafted configs.
  description?: string
}

export function createConfig(body: CreateConfigBody): Promise<Config> {
  return apiRequest<Config>('/api/configs', { method: 'POST', body })
}

export function duplicateConfig(configId: UUID, name: string): Promise<Config> {
  return apiRequest<Config>(`/api/configs/${configId}/duplicate`, {
    method: 'POST',
    body: { name },
  })
}

export function activateConfig(configId: UUID): Promise<Config> {
  return apiRequest<Config>(`/api/configs/${configId}/activate`, { method: 'POST' })
}

/** PATCH a config's knobs and/or name (both optional; server merges params). */
export function patchConfig(
  configId: UUID,
  patch: { params?: Record<string, unknown>; name?: string },
): Promise<Config> {
  return apiRequest<Config>(`/api/configs/${configId}`, {
    method: 'PATCH',
    body: patch,
  })
}

export function deleteConfig(configId: UUID): Promise<{ deleted: UUID }> {
  return apiRequest<{ deleted: UUID }>(`/api/configs/${configId}`, {
    method: 'DELETE',
  })
}
