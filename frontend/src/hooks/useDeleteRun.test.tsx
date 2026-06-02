import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.mock('@/api/runs', () => ({
  deleteRun: vi.fn().mockResolvedValue({ deleted: 'r1' }),
  deleteAllRuns: vi.fn().mockResolvedValue({ deleted_count: 0 }),
  setRunFavorite: vi.fn().mockResolvedValue({}),
}))

import { useDeleteRun } from './useDeleteRun'

describe('useDeleteRun', () => {
  it("removes the deleted run's detail cache on success so it can't show stale data", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['runs', 'detail', 'r1'], { id: 'r1' })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useDeleteRun(), { wrapper })
    result.current.mutate('r1')

    await waitFor(() =>
      expect(client.getQueryData(['runs', 'detail', 'r1'])).toBeUndefined(),
    )
  })
})
