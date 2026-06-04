import { useQuery } from '@tanstack/react-query'
import { listBackfillJobs, type BackfillJobListResponse } from '@/api/bars'

// Feature 013 US1: recent backfill jobs, newest first (server caps the list
// via api.backfill.history_limit). Invalidated when a job completes.
export function useBackfillJobs() {
  return useQuery<BackfillJobListResponse>({
    queryKey: ['bars', 'jobs'],
    queryFn: () => listBackfillJobs(),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  })
}
