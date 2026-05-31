import { useQuery } from '@tanstack/react-query'
import { getHealth } from '@/api/health'
import { POLLING_HEALTH_MS } from '@/config'
import type { HealthResponse } from '@/api/types'

export type HealthState = 'unknown' | 'healthy' | 'unhealthy'

export interface UseHealthResult {
  state: HealthState
  data: HealthResponse | undefined
  isLoading: boolean
  isError: boolean
}

export function useHealth(): UseHealthResult {
  const query = useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: POLLING_HEALTH_MS,
    refetchOnWindowFocus: false,
    retry: 0,
  })

  let state: HealthState = 'unknown'
  if (query.isError) state = 'unhealthy'
  else if (query.data) state = query.data.status === 'ok' && query.data.db === 'ok' ? 'healthy' : 'unhealthy'

  return {
    state,
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
