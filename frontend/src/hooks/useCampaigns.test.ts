// Feature 019 T026 — campaign fetchers + hooks (contracts/research-api.md).
import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'

const listMock = vi.fn()
const getMock = vi.fn()
const startMock = vi.fn()
const cancelMock = vi.fn()
vi.mock('@/api/research', () => ({
  listCampaigns: () => listMock(),
  getCampaign: (id: string) => getMock(id),
  startCampaign: (b: unknown) => startMock(b),
  cancelCampaign: (id: string) => cancelMock(id),
}))

import {
  campaignPollInterval,
  useCampaign,
  useCampaigns,
  useCancelCampaign,
  useStartCampaign,
} from './useCampaigns'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  return createElement(QueryClientProvider, { client }, children)
}

beforeEach(() => {
  for (const m of [listMock, getMock, startMock, cancelMock]) m.mockReset()
})

const campaign = (over: Record<string, unknown> = {}) => ({
  id: 'c-1', seq: 1, starting_config_name: 'default', budget: 4, trials_used: 0,
  status: 'running', verdict: null, verdict_detail: null,
  thresholds: { base_alpha: 0.05 }, cycles: [],
  created_at: '2026-06-06T00:00:00Z', updated_at: '2026-06-06T00:00:00Z', ...over,
})

describe('useCampaigns', () => {
  it('fetches the list with the default budget', async () => {
    listMock.mockResolvedValue({ campaigns: [campaign()], default_budget: 6 })
    const { result } = renderHook(() => useCampaigns(), { wrapper })
    await waitFor(() => expect(result.current.data?.default_budget).toBe(6))
    expect(result.current.data?.campaigns[0].id).toBe('c-1')
  })

  it('fetches one campaign by id', async () => {
    getMock.mockResolvedValue(campaign({ id: 'c-9' }))
    const { result } = renderHook(() => useCampaign('c-9'), { wrapper })
    await waitFor(() => expect(result.current.data?.id).toBe('c-9'))
    expect(getMock).toHaveBeenCalledWith('c-9')
  })

  it('start mutation posts and invalidates', async () => {
    startMock.mockResolvedValue(campaign())
    const { result } = renderHook(() => useStartCampaign(), { wrapper })
    result.current.mutate({ config_name: 'default', budget: 4 })
    await waitFor(() => expect(startMock).toHaveBeenCalledWith({ config_name: 'default', budget: 4 }))
  })

  it('cancel mutation posts the id', async () => {
    cancelMock.mockResolvedValue({ cancel_requested: true })
    const { result } = renderHook(() => useCancelCampaign(), { wrapper })
    result.current.mutate('c-1')
    await waitFor(() => expect(cancelMock).toHaveBeenCalledWith('c-1'))
  })
})

describe('campaignPollInterval', () => {
  it('polls every 2s while running (SC-007 ≤5s) and stops when terminal', () => {
    expect(campaignPollInterval('running')).toBe(2000)
    expect(campaignPollInterval('halted')).toBe(false)
    expect(campaignPollInterval('failed')).toBe(false)
    expect(campaignPollInterval(undefined)).toBe(2000) // unknown yet → keep polling
  })
})
