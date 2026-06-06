import { apiRequest } from './client'
import type { RecommendHealthResponse, RecommendPackResponse } from './types'

// Feature 018: the DETERMINISTIC recommendation surfaces. These never touch
// the Claude analyst — advisory narration goes through api/insights.ts with
// scope='recommend' (FR-009/FR-013).

export function getRecommendHealth(): Promise<RecommendHealthResponse> {
  return apiRequest<RecommendHealthResponse>('/api/recommend/health')
}

export function getRecommendPack(configId: string): Promise<RecommendPackResponse> {
  return apiRequest<RecommendPackResponse>('/api/recommend/pack', {
    searchParams: { config_id: configId },
  })
}
