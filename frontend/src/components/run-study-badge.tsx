import { HelpTooltip } from '@/components/help-tooltip'
import type { Run } from '@/api/types'

// Feature 014 (FR-009): a child run announces its study membership and links
// back to the study detail page. Standalone runs render nothing.

export function RunStudyBadge({ run }: { run: Run }) {
  if (!run.study_id) return null

  const parts: string[] = []
  if (run.window_index != null) parts.push(`window ${run.window_index}`)
  if (run.segment) parts.push(run.segment)

  return (
    <div
      data-testid="run-study-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 10px',
        borderRadius: 999,
        border: '1px solid var(--border)',
        background: 'var(--surface-2, #f6f7f9)',
        fontSize: 'var(--fs-xs, 11px)',
        color: 'var(--text-muted)',
        width: 'fit-content',
      }}
    >
      <span>
        Part of study{parts.length > 0 ? ` — ${parts.join(' · ')}` : ''}
      </span>
      <a
        href={`/validation/${run.study_id}`}
        style={{ color: 'var(--accent, #2563eb)', fontWeight: 600 }}
      >
        View study →
      </a>
      <HelpTooltip helpKey="child_run" />
    </div>
  )
}
