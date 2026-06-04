import { useQuery } from '@tanstack/react-query'
import { getBarsStats, type BarsStatsResponse } from '@/api/bars'

// Feature 013: the Data page snapshot (totals + heatmap months + lineage).
// Invalidated by useBackfillStatus when a backfill completes.
export function useBarsStats() {
  return useQuery<BarsStatsResponse>({
    queryKey: ['bars', 'stats'],
    queryFn: () => getBarsStats(),
    staleTime: 60 * 1000,
    // Persisted to localStorage (stale-while-revalidate): keep restored
    // snapshots alive at least as long as the persister's maxAge (24h).
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
