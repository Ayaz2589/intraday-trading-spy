import type { BackfillJobView } from '@/api/bars'

// Feature 013 US1: the backfill job-history table. Failed jobs stay visible
// with their failure reason (FR-002) — the original pain was a failed job
// vanishing as soon as the next one ran.

function duration(j: BackfillJobView): string {
  if (!j.created_at || !j.updated_at) return '—'
  if (j.status === 'queued' || j.status === 'running') return '…'
  const ms = new Date(j.updated_at).getTime() - new Date(j.created_at).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
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

export function JobHistoryTable({ jobs }: { jobs: BackfillJobView[] }) {
  if (jobs.length === 0) {
    return (
      <p data-testid="job-history" style={{ marginTop: 8, fontSize: 'var(--fs-sm, 13px)', color: 'var(--text-muted)' }}>
        No backfills yet — start one above.
      </p>
    )
  }
  return (
    <table data-testid="job-history" style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse', fontSize: 'var(--fs-sm, 13px)' }}>
      <thead>
        <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
          <th style={{ padding: '4px 8px' }}>Started</th>
          <th style={{ padding: '4px 8px' }}>Range</th>
          <th style={{ padding: '4px 8px' }}>Windows</th>
          <th style={{ padding: '4px 8px' }}>Bars added</th>
          <th style={{ padding: '4px 8px' }}>Took</th>
          <th style={{ padding: '4px 8px' }}>Status</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((j) => (
          <tr key={j.job_id} data-testid={`job-row-${j.job_id}`} style={{ borderTop: '1px solid var(--border)' }}>
            <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>{started(j)}</td>
            <td style={{ padding: '4px 8px', fontFamily: 'var(--mono)' }}>
              {j.range_start} → {j.range_end}
            </td>
            <td style={{ padding: '4px 8px' }}>{j.windows_done}/{j.windows_total}</td>
            <td style={{ padding: '4px 8px' }}>{j.bars_added.toLocaleString()}</td>
            <td style={{ padding: '4px 8px' }}>{duration(j)}</td>
            <td style={{ padding: '4px 8px' }}>
              {j.status === 'failed' && j.failure_reason ? (
                <span
                  title={j.failure_reason}
                  style={{ color: STATUS_COLOR.failed, fontWeight: 600, cursor: 'help', borderBottom: '1px dotted currentColor' }}
                >
                  failed ⓘ
                </span>
              ) : (
                <span style={{ color: STATUS_COLOR[j.status] ?? 'var(--text)', fontWeight: 600 }}>{j.status}</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
