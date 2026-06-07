import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ackPause,
  closePosition,
  getTradeBars,
  getTradeJournal,
  getTradePerformance,
  getTradeState,
  startAutomation,
  stopAutomation,
  submitManualOrder,
  type PaperEvent,
  type TradeBar,
  type TradeBarsResponse,
  type TradeState,
  type TradeView,
} from '@/api/trade'
import { POLLING_INFLIGHT_MS, POLLING_LIST_MS } from '@/config'

// Feature 021: /trade hooks. The cockpit polls fast (1s) while a session is
// running or the market is open; otherwise the list cadence (5s). Chart
// increments ride the `since` cursor so polls carry only new bars.

export function tradeKey(): readonly unknown[] {
  return ['trade'] as const
}

export function statePollInterval(data: TradeState | undefined): number {
  if (!data) return POLLING_INFLIGHT_MS
  return data.session?.status === 'running' || data.market.is_open
    ? POLLING_INFLIGHT_MS
    : POLLING_LIST_MS
}

export function useTradeState() {
  return useQuery<TradeState>({
    queryKey: [...tradeKey(), 'state'],
    queryFn: getTradeState,
    refetchInterval: (query) => statePollInterval(query.state.data),
    refetchOnWindowFocus: false,
  })
}

/** Merge an increment into accumulated bars, deduping on timestamp. */
export function mergeBars(prev: TradeBar[], incoming: TradeBar[]): TradeBar[] {
  if (incoming.length === 0) return prev
  const known = new Set(prev.map(b => b.t))
  return [...prev, ...incoming.filter(b => !known.has(b.t))]
}

export type LiveBars = {
  bars: TradeBar[]
  vwapAvailable: boolean
  vwapReason: string | null
  positionLevels: TradeBarsResponse['position_levels']
  loading: boolean
}

export function useTradeBars(view: TradeView, pollMs = POLLING_INFLIGHT_MS): LiveBars {
  const [state, setState] = useState<LiveBars>({
    bars: [], vwapAvailable: true, vwapReason: null,
    positionLevels: null, loading: true,
  })
  const sinceRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    let dead = false
    sinceRef.current = undefined
    setState(s => ({ ...s, bars: [], loading: true }))

    const tick = async () => {
      try {
        const r = await getTradeBars(view, sinceRef.current)
        if (dead) return
        const isIncrement = sinceRef.current != null
        sinceRef.current = r.next_since ?? sinceRef.current
        setState(prev => ({
          bars: isIncrement ? mergeBars(prev.bars, r.bars) : r.bars,
          vwapAvailable: r.vwap_available,
          vwapReason: r.vwap_reason,
          positionLevels: r.position_levels,
          loading: false,
        }))
      } catch {
        // transient poll errors are tolerated; the next tick retries
      }
    }
    void tick()
    const id = setInterval(() => void tick(), pollMs)
    return () => {
      dead = true
      clearInterval(id)
    }
  }, [view, pollMs])

  return state
}

function useTradeMutation<T>(fn: () => Promise<T>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => client.invalidateQueries({ queryKey: tradeKey() }),
  })
}

export function useStartAutomation() {
  return useTradeMutation(startAutomation)
}

export function useStopAutomation() {
  return useTradeMutation(stopAutomation)
}

export function useAckPause() {
  return useTradeMutation(ackPause)
}

export function useClosePosition() {
  return useTradeMutation(closePosition)
}

export function useSubmitManualOrder() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: { stop_loss: number; take_profit: number }) =>
      submitManualOrder(body),
    onSuccess: () => client.invalidateQueries({ queryKey: tradeKey() }),
  })
}

export function useTradePerformance() {
  return useQuery({
    queryKey: [...tradeKey(), 'performance'],
    queryFn: getTradePerformance,
    refetchInterval: POLLING_LIST_MS,
    refetchOnWindowFocus: false,
  })
}

export function useTradeJournal(sessionId: string | null) {
  const [events, setEvents] = useState<PaperEvent[]>([])
  const seqRef = useRef(0)

  useEffect(() => {
    setEvents([])
    seqRef.current = 0
    if (!sessionId) return
    let dead = false
    const tick = async () => {
      try {
        const r = await getTradeJournal(sessionId, seqRef.current)
        if (dead || r.events.length === 0) return
        seqRef.current = r.events[r.events.length - 1].seq
        setEvents(prev => [...prev, ...r.events])
      } catch {
        // tolerate transient errors
      }
    }
    void tick()
    const id = setInterval(() => void tick(), POLLING_LIST_MS)
    return () => {
      dead = true
      clearInterval(id)
    }
  }, [sessionId])

  return events
}
