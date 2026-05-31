import { useMutation, useQueryClient } from '@tanstack/react-query'
import { startBacktest } from '@/api/backtests'
import { activeRunsTracker } from '@/lib/active-runs-tracker'
import { runsQueryKey } from './useRuns'
import type { StartBacktestRequest, StartBacktestResponse } from '@/api/types'

export function useStartBacktest() {
  const client = useQueryClient()
  return useMutation<StartBacktestResponse, Error, StartBacktestRequest>({
    mutationFn: startBacktest,
    onSuccess: response => {
      activeRunsTracker.track(response.run_id)
      client.invalidateQueries({ queryKey: runsQueryKey() })
    },
  })
}
