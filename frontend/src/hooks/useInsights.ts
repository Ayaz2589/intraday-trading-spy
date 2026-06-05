import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getClaudeAnalysis,
  getClaudeSettings,
  getConfigDistribution,
  getEdgeTimeseries,
  patchClaudeSettings,
  postClaudeAnalysis,
} from '@/api/insights'

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

export const claudeAnalysisQueryKey = (scope: string, scopeId?: string) =>
  ['insights', 'claude-analysis', scope, scopeId ?? 'global'] as const

export const claudeSettingsQueryKey = () => ['insights', 'claude-settings'] as const

export function useClaudeAnalysis(scope: 'study' | 'insights', scopeId?: string) {
  return useQuery({
    queryKey: claudeAnalysisQueryKey(scope, scopeId),
    queryFn: () => getClaudeAnalysis(scope, scopeId),
  })
}

export function useGenerateClaudeAnalysis(scope: 'study' | 'insights', scopeId?: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (force: boolean) =>
      postClaudeAnalysis({ scope, scope_id: scopeId, force }),
    // 400/409/503 are deterministic — retrying never helps (015 lesson).
    retry: false,
    onSuccess: (data) => {
      client.setQueryData(claudeAnalysisQueryKey(scope, scopeId), data)
    },
  })
}

export function useClaudeSettings() {
  return useQuery({ queryKey: claudeSettingsQueryKey(), queryFn: () => getClaudeSettings() })
}

export function useSetClaudeEnabled() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => patchClaudeSettings(enabled),
    retry: false,
    onSuccess: (data) => client.setQueryData(claudeSettingsQueryKey(), data),
  })
}
