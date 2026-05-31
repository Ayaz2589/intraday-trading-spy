import type { DataDownloadJob, RunStatus } from '@/api/types'

const STATUS_COLOR: Record<RunStatus, string> = {
  queued: 'var(--muted, #9ca3af)',
  running: 'var(--info, #2563eb)',
  finished: 'var(--success, #16a34a)',
  failed: 'var(--danger, #dc2626)',
}

interface Props {
  job: DataDownloadJob
}

export function DataDownloadStatus({ job }: Props) {
  return (
    <div
      data-testid={`data-download-status-${job.id}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 8,
        padding: '8px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div>
        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 500 }}>
          {job.start_date} → {job.end_date}
        </div>
        {job.status === 'failed' && job.failure_reason && (
          <div style={{ fontSize: 'var(--fs-xs)', color: STATUS_COLOR.failed, marginTop: 2 }}>
            {job.failure_reason}
          </div>
        )}
        {job.storage_path && (
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
            {job.storage_path}
          </div>
        )}
      </div>
      <span
        data-status={job.status}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 'var(--fs-xs)',
          fontWeight: 600,
          color: STATUS_COLOR[job.status],
        }}
      >
        <span
          aria-hidden
          style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[job.status] }}
        />
        {job.status}
      </span>
    </div>
  )
}
