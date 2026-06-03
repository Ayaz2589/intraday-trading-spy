import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createElement } from 'react'

const startBackfillMock = vi.fn()
const invalidateQueriesMock = vi.fn()

vi.mock('@/api/bars', () => ({
  startBackfill: (body: unknown) => startBackfillMock(body),
}))

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  client.invalidateQueries = invalidateQueriesMock as never
  return {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  }
}

describe('useStartBackfill', () => {
  beforeEach(() => {
    startBackfillMock.mockReset()
    invalidateQueriesMock.mockReset()
  })

  it('starts a backfill and invalidates coverage on success', async () => {
    startBackfillMock.mockResolvedValue({ job_id: 'job-1', status: 'queued' })
    const { useStartBackfill } = await import('./useStartBackfill')
    const { wrapper } = wrap()
    const { result } = renderHook(() => useStartBackfill(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ start: '2018-01-01', end: '2026-06-01', source: 'alpaca' })
    })
    expect(startBackfillMock).toHaveBeenCalledWith({ start: '2018-01-01', end: '2026-06-01', source: 'alpaca' })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['bars', 'coverage'] })
  })
})
