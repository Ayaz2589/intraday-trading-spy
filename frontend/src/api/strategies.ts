import { apiRequest } from './client'
import type { StrategyListResponse } from './types'

export function listStrategies(): Promise<StrategyListResponse> {
  return apiRequest<StrategyListResponse>('/api/strategies')
}
