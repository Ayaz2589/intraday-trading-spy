import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createElement } from 'react'

const getHealthMock = vi.fn()
vi.mock('@/api/health', () => ({
  getHealth: () => getHealthMock(),
}))

describe('useHealth', () => {
  beforeEach(() => {
    getHealthMock.mockReset()
  })
  afterEach(() => {
    vi.clearAllTimers()
  })

  function wrap(): { wrapper: ({ children }: { children: ReactNode }) => ReactNode } {
    const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
    return {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    }
  }

  it('returns healthy when API responds with status=ok,db=ok', async () => {
    getHealthMock.mockResolvedValue({ status: 'ok', db: 'ok' })
    const { useHealth } = await import('./useHealth')
    const { result } = renderHook(() => useHealth(), wrap())
    await waitFor(() => expect(result.current.state).toBe('healthy'))
  })

  it('returns unhealthy when API errors', async () => {
    getHealthMock.mockRejectedValue(new Error('network down'))
    const { useHealth } = await import('./useHealth')
    const { result } = renderHook(() => useHealth(), wrap())
    await waitFor(() => expect(result.current.state).toBe('unhealthy'))
  })

  it('returns unhealthy when API responds db unreachable', async () => {
    getHealthMock.mockResolvedValue({ status: 'ok', db: 'unreachable' })
    const { useHealth } = await import('./useHealth')
    const { result } = renderHook(() => useHealth(), wrap())
    await waitFor(() => expect(result.current.state).toBe('unhealthy'))
  })
})
