import type { RunSummary } from '@/api/types'
import type { JournalRowView } from '@/api/legacy-types'

/**
 * Frontend analogue of the backend `compute_summary`, over the journal rows
 * revealed so far during replay. Returns the same shape `RunSummaryCards`
 * consumes so the summary cards can track the playhead. `sharpe` isn't derivable
 * client-side (and the backend defaults it to 0), so it's 0 here too.
 */
export function computeReplaySummary(rows: JournalRowView[]): RunSummary {
  const executed = rows.filter(r => r.status === 'executed')
  const exited = rows.filter(r => r.status === 'exited')
  const rejected = rows.filter(r => r.status === 'rejected')
  // Completed = decisive exits + force-flats, in chronological (already sorted) order.
  const completed = rows.filter(r => r.status === 'exited' || r.status === 'force_flat')
  const wins = exited.filter(r => r.exit_reason === 'target')

  const totalTrades = executed.length
  const winRate = totalTrades ? wins.length / totalTrades : 0
  const totalPnl = completed.reduce((sum, r) => sum + (r.realized_pnl ?? 0), 0)

  let cum = 0
  let peak = 0
  let maxDd = 0
  for (const r of completed) {
    cum += r.realized_r ?? 0
    peak = Math.max(peak, cum)
    maxDd = Math.min(maxDd, cum - peak)
  }

  return {
    pnl: String(totalPnl),
    win_rate: winRate,
    sharpe: 0,
    max_drawdown: String(maxDd),
    total_trades: totalTrades,
    total_signals: executed.length + rejected.length,
    rejected_signals: rejected.length,
  }
}
