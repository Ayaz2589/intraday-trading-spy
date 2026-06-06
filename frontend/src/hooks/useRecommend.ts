import { useQuery } from '@tanstack/react-query'
import { getRecommendHealth } from '@/api/recommend'

// Feature 018: deterministic recommendation queries (health verdicts; the
// evidence pack joins in US2).

export function useConfigHealth() {
  return useQuery({
    queryKey: ['recommend', 'health'],
    queryFn: getRecommendHealth,
    staleTime: 30_000,
  })
}
