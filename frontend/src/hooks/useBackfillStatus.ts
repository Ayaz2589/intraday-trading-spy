import { useQuery } from '@tanstack/react-query'
import { getBackfillStatus, type BackfillJobView } from '@/api/bars'

const TERMINAL = new Set(['finished', 'failed'])

// Feature 009: poll a backfill job's progress until it reaches a terminal
// state. Pass `null` to disable (no job in flight).
export function useBackfillStatus(jobId: string | null) {
  return useQuery<BackfillJobView>({
    queryKey: ['bars', 'backfill', jobId],
    queryFn: () => getBackfillStatus(jobId as string),
    enabled: jobId != null,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && TERMINAL.has(status) ? false : 2000
    },
    refetchOnWindowFocus: false,
  })
}
