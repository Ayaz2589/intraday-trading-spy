import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createElement } from 'react'

const listRunsMock = vi.fn()
vi.mock('@/api/runs', () => ({
  listRuns: (...args: unknown[]) => listRunsMock(...args),
}))

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  return {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  }
}

describe('useRuns', () => {
  beforeEach(() => listRunsMock.mockReset())

  it('calls listRuns with no cursor on first page', async () => {
    listRunsMock.mockResolvedValue({ runs: [], next_cursor: null })
    const { useRuns } = await import('./useRuns')
    const { result } = renderHook(() => useRuns(), wrap())
    await waitFor(() => expect(result.current.isFetched).toBe(true))
    expect(listRunsMock).toHaveBeenCalledWith({ limit: 50, cursor: undefined })
  })

  it('flattenRuns concatenates all pages', async () => {
    const { flattenRuns } = await import('./useRuns')
    const data = {
      pages: [
        { runs: [{ id: 'a' }, { id: 'b' }], next_cursor: 'c1' },
        { runs: [{ id: 'c' }], next_cursor: null },
      ],
      pageParams: [undefined, 'c1'],
    } as Parameters<typeof flattenRuns>[0]
    expect(flattenRuns(data)?.map(r => r.id)).toEqual(['a', 'b', 'c'])
  })
})
