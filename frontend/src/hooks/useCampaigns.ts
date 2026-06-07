import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cancelCampaign, getCampaign, listCampaigns, startCampaign } from '@/api/research'
import type { Campaign, CampaignListResponse, StartCampaignRequest } from '@/api/types'

// Feature 019 — campaign hooks. Poll-while-running is the app's live pattern
// (studies, backfill jobs); 2s keeps the dashboard within SC-007's 5s bound.

export function campaignsQueryKey(): readonly unknown[] {
  return ['research', 'campaigns'] as const
}

export function campaignQueryKey(id: string): readonly unknown[] {
  return ['research', 'campaign', id] as const
}

/** 2s while running (or unknown), stop once terminal. */
export function campaignPollInterval(status: Campaign['status'] | undefined): number | false {
  return status === 'halted' || status === 'failed' ? false : 2000
}

export function useCampaigns() {
  return useQuery<CampaignListResponse>({
    queryKey: campaignsQueryKey(),
    queryFn: () => listCampaigns(),
    refetchInterval: query => {
      const campaigns = query.state.data?.campaigns ?? []
      return campaigns.some(c => c.status === 'running') ? 2000 : false
    },
    refetchOnWindowFocus: false,
  })
}

export function useCampaign(id: string | undefined) {
  return useQuery<Campaign>({
    queryKey: campaignQueryKey(id ?? ''),
    queryFn: () => getCampaign(id as string),
    enabled: !!id,
    refetchInterval: query => campaignPollInterval(query.state.data?.status),
    refetchOnWindowFocus: false,
  })
}

export function useStartCampaign() {
  const client = useQueryClient()
  return useMutation<Campaign, Error, StartCampaignRequest>({
    mutationFn: startCampaign,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: campaignsQueryKey() })
    },
  })
}

export function useCancelCampaign() {
  const client = useQueryClient()
  return useMutation<{ cancel_requested: boolean }, Error, string>({
    mutationFn: cancelCampaign,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: campaignsQueryKey() })
    },
  })
}
