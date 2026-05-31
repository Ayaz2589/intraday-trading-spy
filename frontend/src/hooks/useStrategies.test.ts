import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'

const listStrategiesMock = vi.fn()
vi.mock('@/api/strategies', () => ({
  listStrategies: () => listStrategiesMock(),
}))

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  return {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  }
}

describe('useStrategies', () => {
  beforeEach(() => listStrategiesMock.mockReset())

  it('returns only enabled strategies', async () => {
    listStrategiesMock.mockResolvedValue({
      strategies: [
        { key: 'a', enabled: true, display_name: 'A', description: '', symbol: 'SPY', direction: 'LONG', kind: 'rule_based' },
        { key: 'b', enabled: false, display_name: 'B', description: '', symbol: 'SPY', direction: 'LONG', kind: 'rule_based' },
      ],
    })
    const { useStrategies } = await import('./useStrategies')
    const { result } = renderHook(() => useStrategies(), wrap())
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map(s => s.key)).toEqual(['a'])
  })
})
