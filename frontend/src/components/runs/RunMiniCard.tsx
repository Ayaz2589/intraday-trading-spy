import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useDeleteRun, useToggleFavorite } from '@/hooks/useDeleteRun'
import type { Run, RunStatus } from '@/api/types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}

function shortRange(start: string, end: string): string {
  if (start === end) return shortDate(start)
  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  if (sy === ey && sm === em) {
    const [, , sd] = start.split('-').map(Number)
    const [, , ed] = end.split('-').map(Number)
    return `${MONTHS[sm - 1]} ${sd}–${ed}`
  }
  return `${shortDate(start)} → ${shortDate(end)}`
}

const STATUS_COLOR: Record<RunStatus, string> = {
  queued: 'var(--muted, #9ca3af)',
  running: 'var(--info, #2563eb)',
  finished: 'var(--success, #16a34a)',
  failed: 'var(--danger, #dc2626)',
}

interface Props {
  run: Run
  active: boolean
}

export function RunMiniCard({ run, active }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const deleteRun = useDeleteRun()
  const toggleFavorite = useToggleFavorite()

  const openConfirm = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setConfirmOpen(true)
  }

  const onToggleFavorite = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    toggleFavorite.mutate({ id: run.id, is_favorite: !run.is_favorite })
  }

  return (
    <>
      <Link
        to="/runs/$runId"
        params={{ runId: run.id }}
        data-testid={`run-mini-card-${run.id}`}
        data-active={active}
        style={{
          display: 'block',
          padding: '8px 10px',
          borderRadius: 'var(--r-sm)',
          border: '1px solid var(--border)',
          background: active ? 'var(--surface-2)' : 'transparent',
          color: 'inherit',
          textDecoration: 'none',
          marginBottom: 6,
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 'var(--fs-xs)',
            fontWeight: 600,
            gap: 4,
          }}
        >
          <span>{shortRange(run.range_start, run.range_end)}</span>
          <span
            data-testid="run-mini-card-status"
            data-status={run.status}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              color: STATUS_COLOR[run.status],
              fontSize: 10,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: STATUS_COLOR[run.status],
              }}
            />
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 2,
            fontSize: 10,
            color: 'var(--text-muted)',
          }}
        >
          <span>
            {run.summary.total_trades} {run.summary.total_trades === 1 ? 'trade' : 'trades'}
          </span>
          <span className="mono">PnL {run.summary.pnl}</span>
        </div>
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-label={run.is_favorite ? 'Unfavorite run' : 'Favorite run'}
          data-testid={`run-mini-card-favorite-${run.id}`}
          style={{
            position: 'absolute',
            top: 4,
            right: 22,
            background: 'transparent',
            border: 'none',
            color: run.is_favorite ? '#f5a524' : 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 12,
            padding: 2,
            lineHeight: 1,
            opacity: run.is_favorite ? 1 : active ? 0.7 : 0,
            transition: 'opacity 80ms ease',
          }}
          title={run.is_favorite ? 'Unfavorite' : 'Favorite'}
        >
          {run.is_favorite ? '★' : '☆'}
        </button>
        <button
          type="button"
          onClick={openConfirm}
          aria-label={`Delete run ${run.id.slice(0, 8)}`}
          data-testid={`run-mini-card-delete-${run.id}`}
          disabled={deleteRun.isPending}
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 12,
            padding: 2,
            lineHeight: 1,
            opacity: active ? 0.7 : 0,
            transition: 'opacity 80ms ease',
          }}
          className="run-mini-card-delete"
          title="Delete run"
        >
          ×
        </button>
      </Link>
      <ConfirmDialog
        open={confirmOpen}
        title="Delete this run?"
        message={
          <>
            This permanently deletes the run, its trades, signals, and journal events.
            <br />
            <code style={{ fontSize: 'var(--fs-xs)' }}>{run.id}</code>
          </>
        }
        confirmLabel={deleteRun.isPending ? 'Deleting…' : 'Delete'}
        variant="destructive"
        onConfirm={() => {
          deleteRun.mutate(run.id, {
            onSuccess: () => setConfirmOpen(false),
          })
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}
