import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  startBackfill,
  type StartBackfillRequest,
  type StartBackfillResponse,
} from '@/api/bars'

// Feature 009: kick off a bulk historical backfill. On success, invalidate the
// coverage query so the panel reflects new data as it lands.
export function useStartBackfill() {
  const qc = useQueryClient()
  return useMutation<StartBackfillResponse, Error, StartBackfillRequest>({
    mutationFn: startBackfill,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bars', 'coverage'] })
    },
  })
}
