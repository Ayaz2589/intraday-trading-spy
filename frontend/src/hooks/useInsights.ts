import { useQuery } from '@tanstack/react-query'
import { getConfigDistribution, getEdgeTimeseries } from '@/api/insights'

// Feature 016: insights queries. (US3 adds the Claude analysis hooks.)

export const edgeTimeseriesQueryKey = (configName?: string) =>
  ['insights', 'edge-timeseries', configName ?? 'all'] as const

export const configDistributionQueryKey = () =>
  ['insights', 'config-distribution'] as const

export function useEdgeTimeseries(configName?: string) {
  return useQuery({
    queryKey: edgeTimeseriesQueryKey(configName),
    queryFn: () => getEdgeTimeseries(configName),
  })
}

export function useConfigDistribution() {
  return useQuery({
    queryKey: configDistributionQueryKey(),
    queryFn: () => getConfigDistribution(),
  })
}
