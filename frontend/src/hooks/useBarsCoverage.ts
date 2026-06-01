import { useQuery } from '@tanstack/react-query'
import { getBarsCoverage, type BarsCoverageResponse } from '@/api/bars'

export function useBarsCoverage() {
  return useQuery<BarsCoverageResponse>({
    queryKey: ['bars', 'coverage'],
    queryFn: () => getBarsCoverage(),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
