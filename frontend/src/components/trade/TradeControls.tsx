import { HelpTooltip } from '../help-tooltip'
import type { TradeState } from '@/api/trade'

// Feature 021 (US1/US2): the automation cockpit controls. 'armed' is a
// DERIVED display state (running + market closed) — never a DB status
// (analyze I1). Drift pauses require an explicit operator acknowledgment.

export function TradeControls({
  state,
  onStart,
  onStop,
  onAck,
  busy = false,
}: {
  state: TradeState
  onStart(): void
  onStop(): void
  onAck(): void
  busy?: boolean
}) {
  const session = state.session
  const running = session?.status === 'running'
  const armed = running && !state.market.is_open
  const paused = running && session?.entries_paused

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span
          data-testid="automation-status"
          className={
            armed ? 'chip chip-muted' : running ? 'chip chip-profit' : 'chip chip-muted'
          }
        >
          {armed ? 'armed — trading at next open'
            : running ? 'running'
            : 'automation off'}
        </span>
        <HelpTooltip helpKey="automation_session" />
        {session && (
          <span className="mono" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
            config: {session.config_name} · since {new Date(session.started_at).toLocaleString()}
          </span>
        )}
        {!running ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={onStart}
            style={{ marginLeft: 'auto' }}
          >
            ▶ Start automation
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={onStop}
            style={{ marginLeft: 'auto' }}
          >
            ■ Stop automation
          </button>
        )}
      </div>

      {!running && !state.market.is_open && (
        <p className="stat-label" style={{ margin: 0 }}>
          The market is closed — starting now arms the session; trading begins
          at the next session open ({state.market.session_start} ET).{' '}
          <HelpTooltip helpKey="armed_session" />
        </p>
      )}

      {paused && session?.pause_reason === 'reconcile_mismatch' && (
        <div
          className="stat-label"
          style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            color: 'var(--loss)', margin: 0,
          }}
        >
          ⚠ Position mismatch between the app and the broker — new entries are
          paused until you acknowledge. <HelpTooltip helpKey="reconcile_drift" />
          <button type="button" className="btn" disabled={busy} onClick={onAck}>
            Acknowledge &amp; resume
          </button>
        </div>
      )}

      {paused && session?.pause_reason === 'stale_data' && (
        <p className="stat-label" style={{ margin: 0, color: 'var(--warn)' }}>
          ⏸ Live data went stale — entries paused; resumes automatically when
          fresh bars arrive. <HelpTooltip helpKey="stale_data_pause" />
        </p>
      )}
    </div>
  )
}
