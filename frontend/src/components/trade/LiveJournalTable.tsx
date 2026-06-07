import { HelpTooltip } from '../help-tooltip'
import { Pager, usePager } from '@/components/pager'
import type { PaperEvent } from '@/api/trade'

// Feature 021 (US3, constitution VI/VII): the live journal — every signal
// outcome and lifecycle event, rejections first-class with reason codes.

function summarize(e: PaperEvent): string {
  const p = e.payload as Record<string, unknown>
  if (e.kind === 'rejected') return String(p.rejection_check ?? p.reason ?? '')
  if (e.kind === 'executed') return `entry ${p.actual_entry} × ${p.quantity}`
  if (e.kind === 'exited' || e.kind === 'force_flat') {
    return `exit ${p.actual_exit ?? ''} · ${p.realized_r != null
      ? `${Number(p.realized_r).toFixed(2)}R` : ''}`
  }
  if (typeof p.reason === 'string') return p.reason
  if (typeof p.config_name === 'string') return `config ${p.config_name}`
  return ''
}

export function LiveJournalTable({ events }: { events: PaperEvent[] }) {
  const newestFirst = [...events].sort((a, b) => b.seq - a.seq)
  const pager = usePager(newestFirst, 15)
  return (
    <div data-testid="live-journal">
      <span className="stat-label">
        every emitted / approved / rejected / executed / exited / force-flat
        event, plus session lifecycle <HelpTooltip helpKey="live_journal" />
      </span>
      {events.length === 0 ? (
        <p className="stat-label" style={{ marginTop: 8 }}>
          No journal events yet for this session.
        </p>
      ) : (
        <>
          <div className="table-scroll" style={{ marginTop: 8 }}>
            <table className="data-table">
              <thead>
                <tr><th>seq</th><th>time</th><th>kind</th><th>detail</th></tr>
              </thead>
              <tbody>
                {pager.pageItems.map(e => (
                  <tr key={e.seq}>
                    <td className="mono">{e.seq}</td>
                    <td className="mono">
                      {new Date(e.timestamp).toLocaleTimeString()}
                    </td>
                    <td>
                      <span className={
                        e.kind === 'rejected' ? 'chip chip-loss'
                          : e.kind === 'executed' || e.kind === 'exited'
                            ? 'chip chip-profit' : 'chip chip-muted'
                      }>
                        {e.kind}
                      </span>
                    </td>
                    <td className="mono">{summarize(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={pager.page} pageCount={pager.pageCount} onPage={pager.setPage} />
        </>
      )}
    </div>
  )
}
