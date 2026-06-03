import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createElement } from 'react'

const getBackfillStatusMock = vi.fn()

vi.mock('@/api/bars', () => ({
  getBackfillStatus: (jobId: string) => getBackfillStatusMock(jobId),
}))

import { useBackfillStatus } from './useBackfillStatus'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  return createElement(QueryClientProvider, { client }, children)
}

describe('useBackfillStatus', () => {
  beforeEach(() => getBackfillStatusMock.mockReset())

  it('is disabled when jobId is null', () => {
    const { result } = renderHook(() => useBackfillStatus(null), { wrapper })
    expect(getBackfillStatusMock).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('polls status for a job id', async () => {
    getBackfillStatusMock.mockResolvedValue({ job_id: 'job-1', status: 'finished', windows_done: 2, windows_total: 2, bars_added: 100 })
    const { result } = renderHook(() => useBackfillStatus('job-1'), { wrapper })
    await waitFor(() => expect(result.current.data?.status).toBe('finished'))
    expect(getBackfillStatusMock).toHaveBeenCalledWith('job-1')
  })
})
