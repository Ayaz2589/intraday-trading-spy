import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useDeleteRun } from '@/hooks/useDeleteRun'
import { RunOriginBadge } from './RunOriginBadge'
import type { Run, RunStatus } from '@/api/types'

// Single source for the list's column template — header (RunsList) and rows
// must never drift apart.
export const RUNS_GRID = '1fr 170px 120px 90px 110px 40px'
export const RUNS_GRID_MIN_WIDTH = 680

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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const mutation = useDeleteRun()

  const openConfirm = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setConfirmOpen(true)
  }

  return (
    <>
      <Link
        to="/runs/$runId"
        params={{ runId: run.id }}
        data-testid={`run-row-${run.id}`}
        style={{
          display: 'grid',
          gridTemplateColumns: RUNS_GRID,
          minWidth: RUNS_GRID_MIN_WIDTH,
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
        <RunOriginBadge run={run} />
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
        <span
          className="mono"
          data-testid="run-row-trades"
          style={{ fontSize: 'var(--fs-xs)', textAlign: 'right' }}
        >
          {run.summary.total_trades}
        </span>
        <span
          className="mono"
          data-testid="run-row-pnl"
          data-sign={pnlSign(run.summary.pnl)}
          style={{
            fontSize: 'var(--fs-xs)',
            textAlign: 'right',
            color:
              pnlSign(run.summary.pnl) === 'neg'
                ? 'var(--loss)'
                : pnlSign(run.summary.pnl) === 'pos'
                  ? 'var(--profit)'
                  : undefined,
          }}
        >
          {run.summary.pnl}
        </span>
        <button
          type="button"
          onClick={openConfirm}
          aria-label={`Delete run ${run.id.slice(0, 8)}`}
          data-testid={`run-row-delete-${run.id}`}
          disabled={mutation.isPending}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 14,
            padding: 4,
            lineHeight: 1,
            justifySelf: 'center',
          }}
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
        confirmLabel={mutation.isPending ? 'Deleting…' : 'Delete'}
        variant="destructive"
        onConfirm={() => {
          mutation.mutate(run.id, {
            onSuccess: () => setConfirmOpen(false),
          })
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

// summary.pnl is a preformatted string ("$120.50", "-$42.10", "+3.4R") —
// derive the sign for the loss/profit color without reformatting it.
function pnlSign(pnl: string): 'pos' | 'neg' | 'zero' {
  const n = parseFloat(pnl.replace(/[^0-9.+-]/g, ''))
  if (!Number.isFinite(n) || n === 0) return 'zero'
  return n < 0 ? 'neg' : 'pos'
}
