// Feature 021 T025 — /trade hooks: polling cadence, since-cursor bar
// accumulation, mutations invalidating the trade key.
import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'

const stateMock = vi.fn()
const barsMock = vi.fn()
const startMock = vi.fn()
vi.mock('@/api/trade', () => ({
  getTradeState: () => stateMock(),
  getTradeBars: (view: string, since?: string) => barsMock(view, since),
  startAutomation: () => startMock(),
  stopAutomation: vi.fn(),
  ackPause: vi.fn(),
  closePosition: vi.fn(),
  submitManualOrder: vi.fn(),
  getTradePerformance: vi.fn(),
  getTradeJournal: vi.fn(),
}))

import {
  mergeBars,
  statePollInterval,
  useStartAutomation,
  useTradeBars,
  useTradeState,
} from './useTrade'
import { POLLING_INFLIGHT_MS, POLLING_LIST_MS } from '@/config'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  return createElement(QueryClientProvider, { client }, children)
}

beforeEach(() => {
  for (const m of [stateMock, barsMock, startMock]) m.mockReset()
})

const STATE = {
  session: { id: 'ps-1', status: 'running' },
  market: { is_open: true },
} as never

describe('statePollInterval', () => {
  it('polls fast while running or the market is open, slow otherwise', () => {
    expect(statePollInterval(STATE)).toBe(POLLING_INFLIGHT_MS)
    expect(
      statePollInterval({ session: null, market: { is_open: false } } as never),
    ).toBe(POLLING_LIST_MS)
  })
})

describe('useTradeState', () => {
  it('fetches the cockpit state', async () => {
    stateMock.mockResolvedValue(STATE)
    const { result } = renderHook(() => useTradeState(), { wrapper })
    await waitFor(() => expect(result.current.data?.session?.id).toBe('ps-1'))
  })
})

describe('mergeBars', () => {
  it('appends only unseen timestamps', () => {
    const a = [{ t: '1' }, { t: '2' }] as never[]
    const b = [{ t: '2' }, { t: '3' }] as never[]
    expect(mergeBars(a, b).map((x: { t: string }) => x.t)).toEqual(['1', '2', '3'])
  })
})

describe('useTradeBars', () => {
  it('fetches the full view then accumulates since-increments', async () => {
    barsMock
      .mockResolvedValueOnce({
        view: '1m',
        bars: [{ t: 'a' }, { t: 'b' }],
        vwap_available: true, vwap_reason: null,
        position_levels: null, next_since: 'b',
      })
      .mockResolvedValue({
        view: '1m',
        bars: [{ t: 'c' }],
        vwap_available: true, vwap_reason: null,
        position_levels: null, next_since: 'c',
      })
    const { result } = renderHook(() => useTradeBars('1m', 10), { wrapper })
    await waitFor(() =>
      expect(result.current.bars.map(b => b.t)).toEqual(['a', 'b', 'c']),
    )
    // the second call carried the cursor
    expect(barsMock.mock.calls.some(c => c[1] === 'b')).toBe(true)
  })
})

describe('useStartAutomation', () => {
  it('posts and resolves', async () => {
    startMock.mockResolvedValue({ id: 'ps-1', status: 'running' })
    const { result } = renderHook(() => useStartAutomation(), { wrapper })
    result.current.mutate()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(startMock).toHaveBeenCalled()
  })
})
