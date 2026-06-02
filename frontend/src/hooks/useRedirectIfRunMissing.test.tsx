import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const { navigateSpy, state } = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  state: { runs: [] as Array<{ id: string }> },
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateSpy }))
vi.mock('./useRuns', () => ({
  useRuns: () => ({ data: undefined }),
  flattenRuns: () => state.runs,
}))

import { useRedirectIfRunMissing } from './useRedirectIfRunMissing'

describe('useRedirectIfRunMissing', () => {
  beforeEach(() => {
    navigateSpy.mockClear()
    state.runs = []
  })

  it('redirects to /runs once a previously-present run disappears', () => {
    state.runs = [{ id: 'r1' }, { id: 'r2' }]
    const { rerender } = renderHook(({ id }) => useRedirectIfRunMissing(id), {
      initialProps: { id: 'r1' },
    })
    expect(navigateSpy).not.toHaveBeenCalled()

    state.runs = [{ id: 'r2' }] // r1 deleted
    rerender({ id: 'r1' })
    expect(navigateSpy).toHaveBeenCalledWith({ to: '/runs', replace: true })
  })

  it('does not redirect a run that was never in the loaded list (just created / deep-linked)', () => {
    state.runs = [{ id: 'r2' }]
    renderHook(() => useRedirectIfRunMissing('r1'))
    expect(navigateSpy).not.toHaveBeenCalled()
  })

  it('does not redirect while the run is still present', () => {
    state.runs = [{ id: 'r1' }]
    renderHook(() => useRedirectIfRunMissing('r1'))
    expect(navigateSpy).not.toHaveBeenCalled()
  })

  it('does nothing when disabled (e.g. invalid run id)', () => {
    state.runs = []
    renderHook(() => useRedirectIfRunMissing('whatever', false))
    expect(navigateSpy).not.toHaveBeenCalled()
  })
})
