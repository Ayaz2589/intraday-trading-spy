import { StudyHeaderCard } from './StudyHeaderCard'
import { StudyStatCards } from './StudyStatCards'
import { PooledGatePanel } from './PooledGatePanel'
import { WindowRows } from './WindowRows'
import { SensitivityPointsTable } from './SensitivityPointsTable'
import { SensitivitySurface } from './sensitivity-surface'
import type {
  SensitivitySurface as Surface,
  ValidationStudy,
  ValidationStudyStatus,
  WalkForwardResult,
} from '@/api/types'

// Feature 014 (FR-011): the redesigned study detail page — header card, stat
// cards, and per-kind drill-down (expandable window rows / surface + points
// table) in the validation card language. Extracted from the route file so
// the composition is testable without the router.

export function StudyDetailPage({
  study,
  status,
  rerunAction,
}: {
  study: ValidationStudy | undefined
  status: ValidationStudyStatus | undefined
  rerunAction?: React.ReactNode
}) {
  if (!study) {
    return (
      <div data-testid="study-detail-loading" style={{ padding: 'var(--sp-5)' }}>
        Loading study…
      </div>
    )
  }

  const inFlight = status?.status === 'queued' || status?.status === 'running'
  const finished = study.status === 'finished' && study.result != null

  return (
    <div style={{ padding: 'var(--sp-5)', display: 'grid', gap: 12 }}>
      <StudyHeaderCard study={study} action={rerunAction} />

      {inFlight && status && (
        <div
          data-testid="study-progress"
          style={{ fontSize: 'var(--fs-sm, 13px)', color: 'var(--text-muted)' }}
        >
          Running… {status.progress_completed}/{status.progress_total} evaluations — this
          page updates automatically.
        </div>
      )}

      <StudyStatCards study={study} />

      {/* Feature 016: the pooled gate — the headline for walk-forward studies.
          Full-gate completion is signaled solely by result.pooled_gate.mode
          === 'full' (never study progress fields — analyze I1). */}
      {finished && study.kind === 'walk_forward' && <PooledGatePanel study={study} />}

      {finished && study.kind === 'walk_forward' && (
        <WindowRows result={study.result as WalkForwardResult} />
      )}

      {finished && study.kind === 'sensitivity' && (
        <>
          <SensitivitySurface surface={study.result as Surface} />
          <SensitivityPointsTable surface={study.result as Surface} />
        </>
      )}
    </div>
  )
}
