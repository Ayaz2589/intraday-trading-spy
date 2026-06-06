import { apiRequest } from './client'

// Feature 018.1: the side-nav Delete-all-data action. Destructive and
// explicit — the ONLY caller is the confirm-gated side-nav button.

export type FactoryResetResponse = {
  deleted: Record<string, number>
  default_config: string
}

export function postFactoryReset(): Promise<FactoryResetResponse> {
  return apiRequest<FactoryResetResponse>('/api/reset/all', { method: 'POST' })
}
