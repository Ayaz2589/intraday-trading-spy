import { apiRequest } from './client'

// Feature 021: the /api/trade surface (specs/021-paper-trading/contracts/
// trade-api.md). Live paper trading — automation lifecycle, broker-truth
// account state, chart views, the forward performance record.

export type PaperSession = {
  id: string
  strategy_id: string
  config_id: string | null
  config_name: string
  config_snapshot: Record<string, unknown>
  status: 'running' | 'stopped' | 'interrupted'
  entries_paused: boolean
  pause_reason: 'stale_data' | 'reconcile_mismatch' | null
  started_at: string
  stopped_at: string | null
  stop_reason: string | null
}

export type TradeMarket = {
  is_open: boolean
  allow_new_trades: boolean
  force_flat_at: string
  no_new_trades_after: string
  session_start: string
  data_fresh: boolean | null
  last_bar_at: string | null
}

export type TradePosition = {
  qty: number
  avg_entry: number
  unrealized_pnl: number
}

export type TradeOpenOrder = {
  broker_order_id: string
  status: string
  side: string
  qty: number
  limit_price: number | null
  stop_price: number | null
  type: string
}

export type TradeState = {
  session: PaperSession | null
  market: TradeMarket
  position: TradePosition | null
  open_orders: TradeOpenOrder[] | null
  today: { trades: number; fills: number; realized_pnl: number }
  account: {
    broker_equity: number
    sizing_account_value: number
    reconciled_at: string
    drift: boolean
  } | null
}

export type TradeBar = {
  t: string
  o: number
  h: number
  l: number
  c: number
  v: number
  vwap: number | null
}

export type TradeView = '1m' | '5m' | '1d' | '30d'

export type TradeBarsResponse = {
  view: TradeView
  bars: TradeBar[]
  vwap_available: boolean
  vwap_reason: string | null
  position_levels: { entry: number; stop: number | null; target: number | null } | null
  next_since: string | null
}

export type PaperTrade = {
  id: string
  session_id: string
  trading_day: string
  origin: 'strategy' | 'manual'
  qty: number
  entry_time: string
  exit_time: string
  entry_price: number
  exit_price: number
  stop_loss: number
  take_profit: number
  exit_reason: 'stop' | 'target' | 'force_flat' | 'manual'
  gross_pnl: number
  fees: number
  realized_r: number
}

export type TradePerformance = {
  summary: {
    trades: number
    wins: number
    win_rate: number | null
    expectancy_r: number | null
    total_r: number
    total_gross_pnl: number
  }
  equity_curve: { t: string; cum_pnl: number }[]
  trades: PaperTrade[]
  sessions: {
    id: string
    started_at: string
    status: string
    trades: number
    total_r: number
  }[]
}

export type PaperEvent = {
  seq: number
  trading_day: string
  timestamp: string
  kind: string
  payload: Record<string, unknown>
}

export function getTradeState(): Promise<TradeState> {
  return apiRequest<TradeState>('/api/trade/state')
}

export function getTradeBars(view: TradeView, since?: string): Promise<TradeBarsResponse> {
  return apiRequest<TradeBarsResponse>('/api/trade/bars', {
    searchParams: since ? { view, since } : { view },
  })
}

export function startAutomation(): Promise<PaperSession> {
  return apiRequest<PaperSession>('/api/trade/automation/start', {
    method: 'POST',
    body: {},
  })
}

export function stopAutomation(): Promise<PaperSession> {
  return apiRequest<PaperSession>('/api/trade/automation/stop', { method: 'POST' })
}

export function ackPause(): Promise<PaperSession> {
  return apiRequest<PaperSession>('/api/trade/automation/ack-pause', { method: 'POST' })
}

export function getTradePerformance(): Promise<TradePerformance> {
  return apiRequest<TradePerformance>('/api/trade/performance')
}

export function getTradeJournal(sessionId: string, sinceSeq = 0): Promise<{ events: PaperEvent[] }> {
  return apiRequest<{ events: PaperEvent[] }>('/api/trade/journal', {
    searchParams: { session_id: sessionId, since_seq: String(sinceSeq) },
  })
}

export function submitManualOrder(body: { stop_loss: number; take_profit: number }): Promise<unknown> {
  return apiRequest('/api/trade/orders', { method: 'POST', body })
}

export function closePosition(): Promise<unknown> {
  return apiRequest('/api/trade/position/close', { method: 'POST' })
}
