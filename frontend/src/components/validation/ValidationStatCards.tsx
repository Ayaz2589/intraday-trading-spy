import type { LockboxState, ValidationStudy } from '@/api/types'

// Validation-page redesign: the stat-cards row — studies at a glance plus the
// lockbox state, in the Data-page card language.

const cardStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 160,
  padding: '12px 14px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-md, 10px)',
  background: 'var(--surface, #fff)',
}

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--fs-xs, 11px)',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: 0.6,
}

const valueStyle: React.CSSProperties = {
  fontSize: 'var(--fs-xl, 22px)',
  fontWeight: 700,
  fontFamily: 'var(--mono)',
  margin: '2px 0',
}

const LOCKBOX_COLOR: Record<LockboxState, string> = {
  unspent: 'var(--pos, #1a7f37)',
  spent: 'var(--accent, #2563eb)',
  burned: 'var(--neg, #b42318)',
}

const LOCKBOX_HINT: Record<LockboxState, string> = {
  unspent: 'you get one shot',
  spent: 'result recorded forever',
  burned: 'no longer trustworthy',
}

export function ValidationStatCards({
  studies,
  lockboxState,
}: {
  studies: ValidationStudy[]
  lockboxState: LockboxState | null // null while loading / unavailable
}) {
  const finished = studies.filter((s) => s.status === 'finished').length
  const failed = studies.filter((s) => s.status === 'failed').length
  const wf = studies.filter((s) => s.kind === 'walk_forward').length
  const sens = studies.filter((s) => s.kind === 'sensitivity').length

  return (
    <div data-testid="validation-stat-cards" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <div style={cardStyle}>
        <div style={labelStyle}>Studies</div>
        <div style={valueStyle}>{studies.length}</div>
        <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
          {wf} walk-forward · {sens} sensitivity
        </div>
      </div>
      <div style={cardStyle}>
        <div style={labelStyle}>Finished</div>
        <div style={{ ...valueStyle, color: 'var(--pos, #1a7f37)' }}>{finished}</div>
        <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>completed studies</div>
      </div>
      <div style={cardStyle}>
        <div style={labelStyle}>Failed</div>
        <div style={{ ...valueStyle, color: failed > 0 ? 'var(--neg, #b42318)' : 'var(--text-muted)' }}>{failed}</div>
        <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>see the table for reasons</div>
      </div>
      <div style={cardStyle}>
        <div style={labelStyle}>Lockbox</div>
        <div data-testid="lockbox-stat" style={{ ...valueStyle, fontSize: 'var(--fs-lg, 18px)', color: lockboxState ? LOCKBOX_COLOR[lockboxState] : 'var(--text-muted)' }}>
          {lockboxState ? lockboxState.toUpperCase() : '—'}
        </div>
        <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
          {lockboxState ? LOCKBOX_HINT[lockboxState] : 'loading…'}
        </div>
      </div>
    </div>
  )
}
