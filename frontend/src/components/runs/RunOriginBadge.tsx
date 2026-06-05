import type { CSSProperties } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { Run } from '@/api/types'

// /runs origin column: where did this backtest come from? Study children
// (walk-forward windows, sensitivity points) show kind · segment · window
// and jump to their study; lockbox one-shots show a plain tag; anything
// else was pushed from the CLI.

const KIND_LABEL: Record<string, string> = {
  walk_forward: 'walk-forward',
  sensitivity: 'sensitivity',
}

const SEGMENT_LABEL: Record<string, string> = {
  train: 'IS',
  validation: 'OOS',
  lockbox: 'lockbox',
}

const badgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  width: 'fit-content',
  padding: '2px 8px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'var(--surface-2, #f6f7f9)',
  fontSize: 'var(--fs-xs, 11px)',
  color: 'var(--text-muted)',
}

export function RunOriginBadge({ run }: { run: Run }) {
  const navigate = useNavigate()

  if (run.study_id) {
    const studyId = run.study_id
    const parts: string[] = []
    if (run.study_kind) parts.push(KIND_LABEL[run.study_kind] ?? run.study_kind)
    if (run.segment) parts.push(SEGMENT_LABEL[run.segment] ?? run.segment)
    if (run.window_index != null) parts.push(`w${run.window_index}`)
    return (
      <button
        type="button"
        data-testid="run-origin-badge"
        aria-label={`Open study ${studyId.slice(0, 8)}`}
        title="Open the study that produced this run"
        onClick={e => {
          // The whole row is a Link to the run — same pattern as the
          // delete button: don't let the row navigation win.
          e.preventDefault()
          e.stopPropagation()
          navigate({ to: '/validation/$studyId', params: { studyId } })
        }}
        style={{ ...badgeStyle, cursor: 'pointer', color: 'var(--accent, #2563eb)' }}
      >
        {parts.join(' · ') || 'study'}
      </button>
    )
  }

  if (run.segment === 'lockbox') {
    return (
      <span data-testid="run-origin-badge" style={badgeStyle}>
        {SEGMENT_LABEL['lockbox']}
      </span>
    )
  }

  return (
    <span
      data-testid="run-origin-badge"
      style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}
    >
      CLI run
    </span>
  )
}
