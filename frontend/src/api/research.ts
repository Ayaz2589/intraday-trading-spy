import { apiRequest } from './client'
import type { Campaign, CampaignListResponse, StartCampaignRequest } from './types'

// Feature 019 — auto-research campaigns (contracts/research-api.md).

export function startCampaign(body: StartCampaignRequest): Promise<Campaign> {
  return apiRequest<Campaign>('/api/research/campaigns', { method: 'POST', body })
}

export function listCampaigns(): Promise<CampaignListResponse> {
  return apiRequest<CampaignListResponse>('/api/research/campaigns')
}

export function getCampaign(id: string): Promise<Campaign> {
  return apiRequest<Campaign>(`/api/research/campaigns/${id}`)
}

export function cancelCampaign(id: string): Promise<{ cancel_requested: boolean }> {
  return apiRequest<{ cancel_requested: boolean }>(
    `/api/research/campaigns/${id}/cancel`,
    { method: 'POST' },
  )
}
