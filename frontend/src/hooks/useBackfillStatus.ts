import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getBackfillStatus, type BackfillJobView } from '@/api/bars'

const TERMINAL = new Set(['finished', 'failed'])

// Feature 009: poll a backfill job's progress until it reaches a terminal
// state. Pass `null` to disable (no job in flight).
//
// Feature 013 (FR-003): when the job completes (success OR failure), the Data
// page's other sections refresh automatically — job history, the stats
// snapshot (summary + heatmap), and the regime coverage.
export function useBackfillStatus(jobId: string | null) {
  const client = useQueryClient()
  const notifiedFor = useRef<string | null>(null)

  const query = useQuery<BackfillJobView>({
    queryKey: ['bars', 'backfill', jobId],
    queryFn: () => getBackfillStatus(jobId as string),
    enabled: jobId != null,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && TERMINAL.has(status) ? false : 2000
    },
    refetchOnWindowFocus: false,
  })

  const status = query.data?.status
  useEffect(() => {
    if (jobId && status && TERMINAL.has(status) && notifiedFor.current !== jobId) {
      notifiedFor.current = jobId
      client.invalidateQueries({ queryKey: ['bars', 'jobs'] })
      client.invalidateQueries({ queryKey: ['bars', 'stats'] })
      client.invalidateQueries({ queryKey: ['bars', 'coverage'] })
    }
  }, [jobId, status, client])

  return query
}
