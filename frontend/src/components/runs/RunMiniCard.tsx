import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useDeleteRun, useToggleFavorite } from '@/hooks/useDeleteRun'
import { formatSignedCurrency, abbreviateSignedCurrency } from '@/lib/format'
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
          padding: '10px 12px',
          borderRadius: 'var(--r-md)',
          border: `1px solid ${active ? 'var(--border-accent)' : 'var(--border)'}`,
          background: active ? 'var(--surface-2)' : 'transparent',
          color: 'inherit',
          textDecoration: 'none',
          marginBottom: 8,
          position: 'relative',
        }}
      >
        {/* Row 1: date range + status pill (right padding reserves the action zone) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 'var(--fs-xs)',
            fontWeight: 600,
            paddingRight: 52,
          }}
        >
          <span style={{ whiteSpace: 'nowrap' }}>{shortRange(run.range_start, run.range_end)}</span>
          <span
            data-testid="run-mini-card-status"
            data-status={run.status}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              color: STATUS_COLOR[run.status],
              fontSize: 10,
              fontWeight: 500,
              textTransform: 'capitalize',
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
            {run.status}
          </span>
        </div>
        {/* Row 2: win rate · trades */}
        <div style={{ marginTop: 5, fontSize: 10, color: 'var(--text-muted)' }}>
          {Math.round(run.summary.win_rate * 100)}% win · {run.summary.total_trades}{' '}
          {run.summary.total_trades === 1 ? 'trade' : 'trades'}
        </div>
        {/* Row 3: P&L */}
        <div
          className="mono"
          style={{
            marginTop: 3,
            fontSize: 'var(--fs-sm)',
            fontWeight: 700,
            color:
              Number(run.summary.pnl) > 0
                ? 'var(--profit)'
                : Number(run.summary.pnl) < 0
                  ? 'var(--loss)'
                  : 'var(--text)',
          }}
        >
          {formatSignedCurrency(run.summary.pnl)}
        </div>
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-label={run.is_favorite ? 'Unfavorite run' : 'Favorite run'}
          data-testid={`run-mini-card-favorite-${run.id}`}
          className={`run-card-btn run-card-fav${run.is_favorite ? ' is-fav' : ''}`}
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
          className="run-card-btn run-card-del"
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

/**
 * Compact run indicator for the collapsed sidebar rail: a colored, clickable
 * P&L chip (green profit / red loss). The active run is ringed; hover shows the
 * date, status, and full P&L.
 */
export function CollapsedRunChip({ run, active }: Props) {
  const n = Number(run.summary.pnl)
  const color = n > 0 ? 'var(--profit)' : n < 0 ? 'var(--loss)' : 'var(--text-muted)'
  return (
    <Link
      to="/runs/$runId"
      params={{ runId: run.id }}
      data-testid={`run-chip-${run.id}`}
      data-active={active}
      title={`${shortRange(run.range_start, run.range_end)} · ${run.status} · ${formatSignedCurrency(run.summary.pnl)}`}
      style={{
        display: 'block',
        textAlign: 'center',
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        fontWeight: 700,
        color,
        padding: '5px 2px',
        borderRadius: 'var(--r-sm)',
        border: `1px solid ${active ? 'var(--border-accent)' : 'transparent'}`,
        background: active ? 'var(--surface-2)' : 'transparent',
        textDecoration: 'none',
        lineHeight: 1.2,
      }}
    >
      {abbreviateSignedCurrency(run.summary.pnl)}
    </Link>
  )
}
