import { useQuery } from '@tanstack/react-query'
import { getRecommendHealth, getRecommendPack } from '@/api/recommend'

// Feature 018: deterministic recommendation queries (health verdicts; the
// evidence pack joins in US2).

export function useConfigHealth() {
  return useQuery({
    queryKey: ['recommend', 'health'],
    queryFn: getRecommendHealth,
    staleTime: 30_000,
  })
}

export function useEvidencePack(configId: string | null) {
  return useQuery({
    queryKey: ['recommend', 'pack', configId],
    queryFn: () => getRecommendPack(configId as string),
    enabled: configId != null,
    staleTime: 30_000,
  })
}
