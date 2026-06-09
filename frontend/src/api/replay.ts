import { apiRequest } from './client'
import type { PaperEvent, TradeBarsResponse } from './trade'

// Feature 022: the /api/replay surface (specs/022-historic-trade-replay/
// contracts/replay-api.md). Historic trade replay — an ephemeral, in-memory
// simulation of a stored session. No brokerage, nothing persisted.

export type ReplayStatus = 'playing' | 'paused' | 'completed' | 'stopped'

export type ReplaySessionInfo = {
  id: string
  session_date: string
  status: ReplayStatus
  automation: boolean
  speed: number
  sim_clock: string
  bars_total: number
  bars_delivered: number
}

export type ReplayPosition = {
  qty: number
  avg_entry: number
  stop_loss: number
  take_profit: number
  unrealized_pnl: number | null
}

export type ReplayState = {
  session: ReplaySessionInfo | null
  market?: {
    sim_now: string
    session_open: string
    session_close: string
    is_simulation: boolean
  }
  position?: ReplayPosition | null
  today?: { trades: number; realized_pnl: number; realized_r: number }
  account?: { sizing_account_value: number; equity: number }
}

export type ReplayTradeRow = {
  origin: string
  entry_time: string
  exit_time: string | null
  entry_price: number
  exit_price: number | null
  exit_reason: string | null
  qty: number
  realized_r: number | null
  gross_pnl: number | null
  realized_pnl: number | null
}

export type ReplayPerformance = {
  summary: {
    trades: number
    wins: number
    win_rate: number | null
    expectancy_r: number | null
    total_r: number
    gross_pnl: number
  }
  equity_curve: { t: string | null; equity: number }[]
  trades: ReplayTradeRow[]
}

export function getReplayDates(): Promise<{
  dates: string[]
  earliest: string | null
  latest: string | null
}> {
  return apiRequest('/api/replay/dates')
}

export function getReplayState(): Promise<ReplayState> {
  return apiRequest<ReplayState>('/api/replay/state')
}

export function startReplay(body: {
  date: string
  speed?: number
  automation?: boolean
}): Promise<ReplayState> {
  return apiRequest<ReplayState>('/api/replay/start', { method: 'POST', body })
}

export function controlReplay(body: {
  action: 'play' | 'pause' | 'speed' | 'automation'
  speed?: number
  enabled?: boolean
}): Promise<ReplayState> {
  return apiRequest<ReplayState>('/api/replay/control', { method: 'POST', body })
}

export function stopReplay(): Promise<ReplayState> {
  return apiRequest<ReplayState>('/api/replay/stop', { method: 'POST' })
}

export function getReplayBars(since?: string): Promise<TradeBarsResponse> {
  return apiRequest<TradeBarsResponse>('/api/replay/bars', {
    searchParams: since ? { since } : {},
  })
}

export function getReplayJournal(sinceSeq = 0): Promise<{ events: PaperEvent[] }> {
  return apiRequest<{ events: PaperEvent[] }>('/api/replay/journal', {
    searchParams: { since_seq: String(sinceSeq) },
  })
}

export function getReplayPerformance(): Promise<ReplayPerformance> {
  return apiRequest<ReplayPerformance>('/api/replay/performance')
}

export function submitReplayOrder(body: {
  stop_loss: number
  take_profit: number
}): Promise<unknown> {
  return apiRequest('/api/replay/orders', { method: 'POST', body })
}

export function closeReplayPosition(): Promise<unknown> {
  return apiRequest('/api/replay/position/close', { method: 'POST' })
}
