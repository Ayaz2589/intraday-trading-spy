import type { PaperEvent } from '@/api/trade'

// Feature 022: turn replay journal events into chart markers with the detail a
// hover popover shows — mirrors the backtest chart's entry/exit annotations,
// driven by the replay journal instead of backtest rows.

export type MarkerTone = 'entry' | 'profit' | 'loss' | 'muted'

export type ReplayMarker = {
  seq: number
  ts: number // ms epoch (anchors to a bar boundary)
  value: number // price anchor on the chart
  tone: MarkerTone
  title: string
  rows: [string, string][] // label / value pairs shown in the popover
}

export const TONE_COLOR: Record<MarkerTone, string> = {
  entry: '#2563eb',
  profit: '#14b884',
  loss: '#f04f6a',
  muted: '#8a96ab',
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
const usd = (v: number | null) => (v == null ? '—' : `$${v.toFixed(2)}`)
const rmult = (v: number | null) =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`
const hhmm = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Build hover-ready markers from replay journal events. Only the events that
 *  describe something that happened *on the chart* become markers; pure
 *  bookkeeping (emitted/approved/lifecycle) is left to the journal table. An
 *  event with no anchorable price is skipped. */
export function buildReplayMarkers(events: PaperEvent[]): ReplayMarker[] {
  const out: ReplayMarker[] = []
  for (const e of events) {
    const p = e.payload as Record<string, unknown>
    const ts = Date.parse(e.timestamp)
    if (Number.isNaN(ts)) continue
    const time = hhmm(e.timestamp)
    const origin = typeof p.origin === 'string' ? p.origin : undefined

    if (e.kind === 'executed') {
      const entry = num(p.actual_entry) ?? num(p.planned_entry)
      if (entry == null) continue
      out.push({
        seq: e.seq, ts, value: entry, tone: 'entry',
        title: origin === 'manual' ? 'Manual entry' : 'Entry',
        rows: [
          ['Time', `${time} ET`],
          ['Entry', usd(entry)],
          ['Qty', String(num(p.quantity) ?? '—')],
          ['Stop', usd(num(p.stop_loss))],
          ['Target', usd(num(p.take_profit))],
        ],
      })
    } else if (e.kind === 'exited' || e.kind === 'force_flat') {
      const exit = num(p.actual_exit)
      if (exit == null) continue
      const r = num(p.realized_r)
      const reason = typeof p.exit_reason === 'string' ? p.exit_reason : e.kind
      const tone: MarkerTone =
        e.kind === 'force_flat' || reason === 'force_flat' || reason === 'manual'
          ? 'muted'
          : (r ?? 0) >= 0 ? 'profit' : 'loss'
      out.push({
        seq: e.seq, ts, value: exit, tone,
        title: reason === 'manual' ? 'Manual close' : `Exit · ${reason}`,
        rows: [
          ['Time', `${time} ET`],
          ['Exit', usd(exit)],
          ['R', rmult(r)],
          ['P&L', usd(num(p.gross_pnl) ?? num(p.realized_pnl))],
        ],
      })
    } else if (e.kind === 'rejected') {
      const anchor = num(p.vwap) ?? num(p.planned_entry)
      if (anchor == null) continue
      out.push({
        seq: e.seq, ts, value: anchor, tone: 'loss', title: 'Rejected',
        rows: [
          ['Time', `${time} ET`],
          ['Why', String(p.rejection_check ?? p.reason ?? 'rejected')],
        ],
      })
    } else if (e.kind === 'skipped_window') {
      const anchor = num(p.vwap)
      if (anchor == null) continue
      out.push({
        seq: e.seq, ts, value: anchor, tone: 'muted', title: 'Skipped — entry window',
        rows: [
          ['Time', `${time} ET`],
          ['Why', String(p.reason ?? 'outside entry window')],
        ],
      })
    }
  }
  return out
}
