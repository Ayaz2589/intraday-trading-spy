import { apiRequest } from './client'
import type {
  ConfigDistributionResponse,
  EdgeTimeseriesResponse,
  InsightSettingsView,
  StoredAnalysisView,
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

export function getClaudeAnalysis(
  scope: 'study' | 'insights' | 'recommend',
  scopeId?: string,
): Promise<StoredAnalysisView | null> {
  return apiRequest<StoredAnalysisView | null>('/api/insights/claude-analysis', {
    searchParams: scopeId ? { scope, scope_id: scopeId } : { scope },
  })
}

export function postClaudeAnalysis(body: {
  scope: 'study' | 'insights' | 'recommend'
  scope_id?: string
  force?: boolean
}): Promise<StoredAnalysisView> {
  return apiRequest<StoredAnalysisView>('/api/insights/claude-analysis', {
    method: 'POST',
    body,
  })
}

export function getClaudeSettings(): Promise<InsightSettingsView> {
  return apiRequest<InsightSettingsView>('/api/insights/claude-settings')
}

export function patchClaudeSettings(enabled: boolean): Promise<InsightSettingsView> {
  return apiRequest<InsightSettingsView>('/api/insights/claude-settings', {
    method: 'PATCH',
    body: { enabled },
  })
}
