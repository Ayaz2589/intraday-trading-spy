import { useQuery } from '@tanstack/react-query'
import { getBarsCoverage, type BarsCoverageResponse } from '@/api/bars'

export function useBarsCoverage() {
  return useQuery<BarsCoverageResponse>({
    queryKey: ['bars', 'coverage'],
    queryFn: () => getBarsCoverage(),
    staleTime: 60 * 1000,
    // Persisted to localStorage (stale-while-revalidate) — see query-persist.ts.
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
