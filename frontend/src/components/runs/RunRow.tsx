import { Link } from '@tanstack/react-router'
import type { Run, RunStatus } from '@/api/types'

const STATUS_LABEL: Record<RunStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  finished: 'Finished',
  failed: 'Failed',
}

const STATUS_COLOR: Record<RunStatus, string> = {
  queued: 'var(--muted, #9ca3af)',
  running: 'var(--info, #2563eb)',
  finished: 'var(--success, #16a34a)',
  failed: 'var(--danger, #dc2626)',
}

interface Props {
  run: Run
  failureReason?: string | null
}

export function RunRow({ run, failureReason }: Props) {
  return (
    <Link
      to="/runs/$runId"
      params={{ runId: run.id }}
      data-testid={`run-row-${run.id}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 120px 120px 120px',
        gap: 12,
        alignItems: 'center',
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div>
        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 500 }}>{formatTime(run.started_at)}</div>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
          {run.range_start} → {run.range_end}
        </div>
        {run.status === 'failed' && failureReason && (
          <div
            data-testid="run-row-failure-reason"
            style={{ fontSize: 'var(--fs-xs)', color: STATUS_COLOR.failed, marginTop: 2 }}
          >
            {failureReason}
          </div>
        )}
      </div>
      <span
        data-testid="run-row-status"
        data-status={run.status}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 'var(--fs-xs)',
          fontWeight: 600,
          color: STATUS_COLOR[run.status],
        }}
      >
        <span
          aria-hidden
          style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[run.status] }}
        />
        {STATUS_LABEL[run.status]}
      </span>
      <span style={{ fontSize: 'var(--fs-xs)', textAlign: 'right' }}>
        {run.summary.total_trades} trades
      </span>
      <span style={{ fontSize: 'var(--fs-xs)', textAlign: 'right' }}>
        PnL {run.summary.pnl}
      </span>
    </Link>
  )
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}
