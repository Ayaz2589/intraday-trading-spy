import { useQuery } from '@tanstack/react-query'
import { listStrategies } from '@/api/strategies'
import type { Strategy } from '@/api/types'

const SIXTY_SECONDS = 60_000

export function useStrategies() {
  return useQuery<Strategy[]>({
    queryKey: ['strategies'],
    queryFn: async () => {
      const response = await listStrategies()
      // Defensive: backend already filters but keep the UI honest.
      return response.strategies.filter(s => s.enabled)
    },
    refetchInterval: SIXTY_SECONDS,
    staleTime: SIXTY_SECONDS,
    refetchOnWindowFocus: false,
  })
}
