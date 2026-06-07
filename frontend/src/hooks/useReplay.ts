import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  closeReplayPosition,
  controlReplay,
  getReplayBars,
  getReplayDates,
  getReplayJournal,
  getReplayPerformance,
  getReplayState,
  startReplay,
  stopReplay,
  submitReplayOrder,
  type ReplayState,
} from '@/api/replay'
import type { PaperEvent } from '@/api/trade'
import type { LiveBars } from '@/hooks/useTrade'
import { mergeBars } from '@/hooks/useTrade'
import { POLLING_INFLIGHT_MS, POLLING_LIST_MS } from '@/config'

// Feature 022: /trade/historic hooks. The replay is server-paced; the page
// polls fast while playing (bars surface as the simulated clock advances) and
// idles otherwise. Chart increments ride the `since` cursor.

export function replayKey(): readonly unknown[] {
  return ['replay'] as const
}

function statePoll(data: ReplayState | undefined): number {
  return data?.session?.status === 'playing' ? POLLING_INFLIGHT_MS : POLLING_LIST_MS
}

export function useReplayDates() {
  return useQuery({
    queryKey: [...replayKey(), 'dates'],
    queryFn: getReplayDates,
    refetchOnWindowFocus: false,
  })
}

export function useReplayState() {
  return useQuery<ReplayState>({
    queryKey: [...replayKey(), 'state'],
    queryFn: getReplayState,
    refetchInterval: (query) => statePoll(query.state.data),
    refetchOnWindowFocus: false,
  })
}

export function useReplayBars(active: boolean, pollMs = POLLING_INFLIGHT_MS): LiveBars {
  const [state, setState] = useState<LiveBars>({
    bars: [], vwapAvailable: true, vwapReason: null,
    positionLevels: null, loading: true,
  })
  const sinceRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!active) {
      sinceRef.current = undefined
      setState({ bars: [], vwapAvailable: true, vwapReason: null,
        positionLevels: null, loading: false })
      return
    }
    let dead = false
    const tick = async () => {
      try {
        const r = await getReplayBars(sinceRef.current)
        if (dead) return
        const isIncrement = sinceRef.current != null
        sinceRef.current = r.next_since ?? sinceRef.current
        setState((prev) => ({
          bars: isIncrement ? mergeBars(prev.bars, r.bars) : r.bars,
          vwapAvailable: r.vwap_available,
          vwapReason: r.vwap_reason,
          positionLevels: r.position_levels,
          loading: false,
        }))
      } catch {
        // tolerate transient poll errors
      }
    }
    void tick()
    const id = setInterval(() => void tick(), pollMs)
    return () => {
      dead = true
      clearInterval(id)
    }
  }, [active, pollMs])

  return state
}

export function useReplayJournal(active: boolean) {
  const [events, setEvents] = useState<PaperEvent[]>([])
  const seqRef = useRef(0)

  useEffect(() => {
    setEvents([])
    seqRef.current = 0
    if (!active) return
    let dead = false
    const tick = async () => {
      try {
        const r = await getReplayJournal(seqRef.current)
        if (dead || r.events.length === 0) return
        seqRef.current = r.events[r.events.length - 1].seq
        setEvents((prev) => [...prev, ...r.events])
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
  }, [active])

  return events
}

export function useReplayPerformance(active: boolean) {
  return useQuery({
    queryKey: [...replayKey(), 'performance'],
    queryFn: getReplayPerformance,
    enabled: active,
    refetchInterval: active ? POLLING_LIST_MS : false,
    refetchOnWindowFocus: false,
  })
}

function useReplayMutation<TArgs, TOut>(fn: (args: TArgs) => Promise<TOut>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => client.invalidateQueries({ queryKey: replayKey() }),
  })
}

export function useStartReplay() {
  return useReplayMutation(startReplay)
}

export function useControlReplay() {
  return useReplayMutation(controlReplay)
}

export function useStopReplay() {
  return useReplayMutation((_: void) => stopReplay())
}

export function useSubmitReplayOrder() {
  return useReplayMutation(submitReplayOrder)
}

export function useCloseReplayPosition() {
  return useReplayMutation((_: void) => closeReplayPosition())
}
