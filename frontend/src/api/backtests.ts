import { apiRequest } from './client'
import type { StartBacktestRequest, StartBacktestResponse } from './types'

export function startBacktest(body: StartBacktestRequest): Promise<StartBacktestResponse> {
  return apiRequest<StartBacktestResponse>('/api/backtests', { method: 'POST', body })
}
