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

  // Feature 013 T008 (FR-003): when a job reaches a terminal state, the
  // page's data refreshes automatically — jobs history, stats, coverage.
  it('invalidates jobs/stats/coverage queries once when the job completes', async () => {
    getBackfillStatusMock.mockResolvedValue({ job_id: 'job-2', status: 'finished', windows_done: 2, windows_total: 2, bars_added: 5 })
    const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const localWrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children)

    const { result } = renderHook(() => useBackfillStatus('job-2'), { wrapper: localWrapper })
    await waitFor(() => expect(result.current.data?.status).toBe('finished'))

    await waitFor(() => {
      const keys = invalidate.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey))
      expect(keys).toContain(JSON.stringify(['bars', 'jobs']))
      expect(keys).toContain(JSON.stringify(['bars', 'stats']))
      expect(keys).toContain(JSON.stringify(['bars', 'coverage']))
    })
    // Once per terminal transition — not on every poll render.
    const jobsCalls = invalidate.mock.calls.filter(
      (c) => JSON.stringify(c[0]?.queryKey) === JSON.stringify(['bars', 'jobs']),
    )
    expect(jobsCalls.length).toBe(1)
  })
})
