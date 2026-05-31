import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createElement } from 'react'

const startBacktestMock = vi.fn()
const trackMock = vi.fn()
const invalidateQueriesMock = vi.fn()

vi.mock('@/api/backtests', () => ({
  startBacktest: (body: unknown) => startBacktestMock(body),
}))
vi.mock('@/lib/active-runs-tracker', () => ({
  activeRunsTracker: { track: trackMock },
}))

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  client.invalidateQueries = invalidateQueriesMock as never
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  }
}

describe('useStartBacktest', () => {
  beforeEach(() => {
    startBacktestMock.mockReset()
    trackMock.mockReset()
    invalidateQueriesMock.mockReset()
  })

  it('tracks the new run + invalidates runs list on success', async () => {
    startBacktestMock.mockResolvedValue({ run_id: 'run-123', status: 'queued' })
    const { useStartBacktest } = await import('./useStartBacktest')
    const { wrapper } = wrap()
    const { result } = renderHook(() => useStartBacktest(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ config_name: 'default' })
    })
    expect(startBacktestMock).toHaveBeenCalledWith({ config_name: 'default' })
    expect(trackMock).toHaveBeenCalledWith('run-123')
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['runs', 'list'] })
  })
})
