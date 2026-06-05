import { apiRequest } from './client'
import type {
  ConfigDistributionResponse,
  EdgeTimeseriesResponse,
} from './types'

// Feature 016: cross-run aggregates over the OOS child-run archive.
// (US3 adds the Claude analysis + settings client functions here.)

export function getEdgeTimeseries(configName?: string): Promise<EdgeTimeseriesResponse> {
  return apiRequest<EdgeTimeseriesResponse>('/api/insights/edge-timeseries', {
    searchParams: configName ? { config_name: configName } : {},
  })
}

export function getConfigDistribution(): Promise<ConfigDistributionResponse> {
  return apiRequest<ConfigDistributionResponse>('/api/insights/config-distribution')
}
