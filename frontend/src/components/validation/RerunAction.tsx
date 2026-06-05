import { HelpTooltip } from '../help-tooltip'

// Re-run UX fix (post-014): the study-header action. Idle → the Re-run
// button; while the cloned study runs → an inline progress bar, so the
// current study's results never disappear. The route navigates to the new
// study when it finishes.

export function RerunAction({
  pending,
  progress,
  onRerun,
}: {
  pending: boolean
  // non-null while the cloned study is queued/running
  progress: { completed: number; total: number } | null
  onRerun: () => void
}) {
  if (progress) {
    const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0
    return (
      <span
        data-testid="rerun-progress"
        style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, minWidth: 150 }}
      >
        <span className="mono" style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
          Re-running… {progress.completed}/{progress.total}
        </span>
        <div style={{ height: 4, borderRadius: 999, background: 'var(--surface-2, #eee)', overflow: 'hidden' }}>
          <div
            data-testid="rerun-progress-bar"
            style={{ width: `${pct}%`, height: '100%', background: 'var(--accent, #2563eb)' }}
          />
        </div>
      </span>
    )
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button
        type="button"
        disabled={pending}
        onClick={onRerun}
        style={{
          padding: '5px 12px',
          borderRadius: 'var(--r-sm, 6px)',
          border: '1px solid var(--border)',
          background: 'var(--surface-2, #f6f7f9)',
          color: 'var(--text)',
          fontSize: 'var(--fs-sm, 13px)',
          fontWeight: 600,
          cursor: pending ? 'wait' : 'pointer',
        }}
      >
        {pending ? 'Starting…' : '↻ Re-run study'}
      </button>
      <HelpTooltip helpKey="rerun_study" />
    </span>
  )
}
