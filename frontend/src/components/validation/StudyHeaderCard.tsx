import type { SensitivitySurface, ValidationStudy, WalkForwardResult } from '@/api/types'

// Feature 014 (FR-011): study detail header — kind chip + config name, a
// params subtitle derived from the result, status pill, and an action slot
// (the Re-run button's home). Same card language as the validation page.

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  finished: { color: 'var(--pos, #1a7f37)', bg: 'var(--pos-bg, #e6f4ea)' },
  failed: { color: 'var(--neg, #b42318)', bg: 'var(--neg-bg, #fdecea)' },
  running: { color: 'var(--accent, #2563eb)', bg: 'var(--accent-bg, #e8effd)' },
  queued: { color: 'var(--text-muted)', bg: 'var(--surface-2, #eee)' },
}

const KIND_LABEL: Record<string, string> = {
  walk_forward: 'walk-forward',
  sensitivity: 'sensitivity',
}

function subtitle(s: ValidationStudy): string {
  if (s.kind === 'walk_forward' && s.result && 'mode' in (s.result as object)) {
    const r = s.result as WalkForwardResult
    return `${r.mode} · ${r.train_months}m train / ${r.step_months}m step / ${r.validation_months}m validation`
  }
  if (s.kind === 'sensitivity' && s.result && 'metric_name' in (s.result as object)) {
    const r = s.result as SensitivitySurface
    return `${r.metric_name} · segment ${r.segment} · ${r.knobs.join(' × ')}`
  }
  return new Date(s.created_at).toLocaleString()
}

export function StudyHeaderCard({
  study,
  action,
}: {
  study: ValidationStudy
  action?: React.ReactNode
}) {
  const style = STATUS_STYLE[study.status] ?? STATUS_STYLE.queued

  return (
    <div
      data-testid="study-header-card"
      style={{
        padding: '14px 16px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md, 10px)',
        background: 'var(--surface, #fff)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ padding: '1px 8px', borderRadius: 999, fontSize: 'var(--fs-xs, 11px)', fontWeight: 600, border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            {KIND_LABEL[study.kind] ?? study.kind}
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 'var(--fs-base, 15px)' }}>
            {study.config_name ?? '—'}
          </span>
          <span style={{ padding: '1px 8px', borderRadius: 999, fontWeight: 600, fontSize: 'var(--fs-xs, 11px)', color: style.color, background: style.bg }}>
            {study.status}
          </span>
          <span className="mono" style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
            {study.progress_completed}/{study.progress_total}
          </span>
        </div>
        <p
          data-testid="study-header-subtitle"
          style={{ margin: '4px 0 0', fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}
        >
          {subtitle(study)}
        </p>
        {study.status === 'failed' && study.failure_reason && (
          <p className="mono" style={{ margin: '6px 0 0', fontSize: 'var(--fs-sm, 13px)', color: 'var(--neg, #b42318)' }}>
            {study.failure_reason}
          </p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
