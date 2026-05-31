import { apiRequest } from './client'
import type { Config, UUID } from './types'

export type ConfigListResponse = { configs: Config[] }

export function listConfigs(): Promise<ConfigListResponse> {
  return apiRequest<ConfigListResponse>('/api/configs')
}

export function patchConfig(
  configId: UUID,
  params: Record<string, unknown>,
): Promise<Config> {
  return apiRequest<Config>(`/api/configs/${configId}`, {
    method: 'PATCH',
    body: { params },
  })
}
