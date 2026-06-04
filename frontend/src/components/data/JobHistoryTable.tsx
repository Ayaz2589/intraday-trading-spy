import { Fragment, useState } from 'react'
import { formatMs, jobStats } from '@/lib/backfill-estimate'
import type { BackfillJobView } from '@/api/bars'

// Feature 013 US1 + data-page redesign: the backfill job-history card.
// Stats row over the listed jobs, windows mini progress bars, "+N" bars,
// and expandable FAILED rows revealing the failure reason + "Retry this
// range" (re-launches the backfill with that row's exact range). Failures
// stay visible (FR-002) — the original pain was a failed job vanishing.

function duration(j: BackfillJobView): string {
  if (!j.created_at || !j.updated_at) return '—'
  if (j.status === 'queued' || j.status === 'running') return '…'
  const ms = new Date(j.updated_at).getTime() - new Date(j.created_at).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  return formatMs(ms)
}

function started(j: BackfillJobView): string {
  if (!j.created_at) return '—'
  const d = new Date(j.created_at)
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : '—'
}

const STATUS_COLOR: Record<string, string> = {
  finished: 'var(--pos, #1a7f37)',
  failed: 'var(--neg, #b42318)',
  running: 'var(--accent, #2563eb)',
  queued: 'var(--text-muted)',
}

function StatusPill({ j }: { j: BackfillJobView }) {
  const color = STATUS_COLOR[j.status] ?? 'var(--text)'
  return (
    <span
      title={j.status === 'failed' ? j.failure_reason ?? undefined : undefined}
      style={{
        padding: '1px 8px',
        borderRadius: 999,
        fontWeight: 600,
        fontSize: 'var(--fs-xs, 11px)',
        color,
        background: j.status === 'finished' ? 'var(--pos-bg, #e6f4ea)' : j.status === 'failed' ? 'var(--neg-bg, #fdecea)' : 'var(--surface-2, #eee)',
      }}
    >
      {j.status}
    </span>
  )
}

function WindowsCell({ j }: { j: BackfillJobView }) {
  const pct = j.windows_total > 0 ? Math.round((j.windows_done / j.windows_total) * 100) : 0
  return (
    <div style={{ minWidth: 80 }}>
      <span className="mono" style={{ fontSize: 'var(--fs-xs, 11px)' }}>
        {j.windows_done}/{j.windows_total}
      </span>
      <div style={{ height: 3, borderRadius: 999, background: 'var(--surface-2, #eee)', overflow: 'hidden', marginTop: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: j.status === 'failed' ? 'var(--neg, #b42318)' : 'var(--pos, #16a34a)' }} />
      </div>
    </div>
  )
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <span>
      <span style={{ display: 'block', fontSize: 'var(--fs-xs, 10px)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </span>
      <span className={mono ? 'mono' : undefined} style={{ wordBreak: 'break-all' }}>{value}</span>
    </span>
  )
}

function ActionButton({ pending, onClick, children }: { pending: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      style={{
        padding: '5px 12px',
        borderRadius: 'var(--r-sm, 6px)',
        border: '1px solid var(--border-strong, #ccc)',
        background: 'var(--surface, #fff)',
        fontWeight: 600,
        cursor: pending ? 'wait' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

export function JobHistoryTable({
  jobs,
  onRetry,
  retryPending = false,
}: {
  jobs: BackfillJobView[]
  onRetry?: (start: string, end: string) => void
  retryPending?: boolean
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (jobs.length === 0) {
    return (
      <p data-testid="job-history" style={{ marginTop: 8, fontSize: 'var(--fs-sm, 13px)', color: 'var(--text-muted)' }}>
        No backfills yet — start one above.
      </p>
    )
  }

  const stats = jobStats(jobs)

  return (
    <div data-testid="job-history" style={{ marginTop: 8 }}>
      <div data-testid="job-stats" style={{ display: 'flex', gap: 22, marginBottom: 8 }}>
        {(
          [
            [String(stats.total), 'total jobs', 'var(--text)'],
            [String(stats.finished), 'finished', 'var(--pos, #1a7f37)'],
            [String(stats.failed), 'failed', stats.failed > 0 ? 'var(--neg, #b42318)' : 'var(--text-muted)'],
            [stats.barsAdded.toLocaleString(), 'bars added', 'var(--text)'],
          ] as Array<[string, string, string]>
        ).map(([value, label, color]) => (
          <span key={label}>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 'var(--fs-lg, 17px)', color }}>{value}</span>
            <span style={{ display: 'block', fontSize: 'var(--fs-xs, 10px)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {label}
            </span>
          </span>
        ))}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm, 13px)' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 'var(--fs-xs, 11px)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <th style={{ padding: '4px 8px' }}>Started</th>
            <th style={{ padding: '4px 8px' }}>Range</th>
            <th style={{ padding: '4px 8px' }}>Windows</th>
            <th style={{ padding: '4px 8px' }}>Bars added</th>
            <th style={{ padding: '4px 8px' }}>Took</th>
            <th style={{ padding: '4px 8px' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => {
            const failedRow = j.status === 'failed'
            const isOpen = expanded === j.job_id
            return (
              <Fragment key={j.job_id}>
                <tr
                  data-testid={`job-row-${j.job_id}`}
                  onClick={() => setExpanded(isOpen ? null : j.job_id)}
                  style={{
                    borderTop: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: isOpen ? 'var(--surface-2, #f6f7f9)' : undefined,
                  }}
                >
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    <span aria-hidden style={{ color: 'var(--text-muted)', marginRight: 4 }}>
                      {isOpen ? '▾' : '▸'}
                    </span>
                    {started(j)}
                  </td>
                  <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                    {j.range_start} → {j.range_end}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <WindowsCell j={j} />
                  </td>
                  <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)' }}>+{j.bars_added.toLocaleString()}</td>
                  <td style={{ padding: '6px 8px' }}>{duration(j)}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <StatusPill j={j} />
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={6} style={{ padding: '0 8px 12px' }}>
                      <div
                        data-testid={`job-detail-${j.job_id}`}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 'var(--r-md, 8px)',
                          border: '1px solid var(--border)',
                          background: 'var(--surface, #fff)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, fontSize: 'var(--fs-sm, 13px)' }}>
                          <Detail label="Job ID" value={j.job_id} mono />
                          <Detail label="Source" value={j.source} mono />
                          <Detail label="Range" value={`${j.range_start} → ${j.range_end}`} mono />
                          <Detail label="Started" value={started(j)} />
                          <Detail label="Completed" value={j.updated_at ? new Date(j.updated_at).toLocaleString() : '—'} />
                          <Detail label="Duration" value={duration(j)} />
                          <Detail label="Windows" value={`${j.windows_done}/${j.windows_total}`} mono />
                          <Detail label="Bars added" value={`+${j.bars_added.toLocaleString()}`} mono />
                          <Detail
                            label="Gap sessions filled"
                            value={
                              j.gap_session_dates.length > 0
                                ? j.gap_session_dates.join(', ')
                                : 'none — everything already cached'
                            }
                            mono={j.gap_session_dates.length > 0}
                          />
                        </div>

                        {failedRow && (
                          <div
                            data-testid={`failure-panel-${j.job_id}`}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 12,
                              padding: '8px 12px',
                              borderRadius: 'var(--r-md, 8px)',
                              border: '1px solid var(--neg, #b42318)',
                              background: 'var(--neg-bg, #fdecea)',
                              flexWrap: 'wrap',
                            }}
                          >
                            <span style={{ fontSize: 'var(--fs-sm, 13px)' }}>
                              <span style={{ display: 'block', fontSize: 'var(--fs-xs, 10px)', color: 'var(--neg, #b42318)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                Failure reason
                              </span>
                              <span className="mono">{j.failure_reason ?? 'unknown'}</span>
                            </span>
                            {onRetry && (
                              <ActionButton pending={retryPending} onClick={() => onRetry(j.range_start, j.range_end)}>
                                ↻ Retry this range
                              </ActionButton>
                            )}
                          </div>
                        )}
                        {!failedRow && onRetry && (
                          <div>
                            <ActionButton pending={retryPending} onClick={() => onRetry(j.range_start, j.range_end)}>
                              ↻ Run this range again
                            </ActionButton>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
