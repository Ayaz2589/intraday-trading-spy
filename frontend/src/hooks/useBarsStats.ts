import { useQuery } from '@tanstack/react-query'
import { getBarsStats, type BarsStatsResponse } from '@/api/bars'

// Feature 013: the Data page snapshot (totals + heatmap months + lineage).
// Invalidated by useBackfillStatus when a backfill completes.
export function useBarsStats() {
  return useQuery<BarsStatsResponse>({
    queryKey: ['bars', 'stats'],
    queryFn: () => getBarsStats(),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
