import { HelpTooltip } from '../help-tooltip'
import type { ReplaySessionInfo, ReplayStatus } from '@/api/replay'

// Feature 022: the replay cockpit controls — date picker, transport
// (play/pause/stop), playback speed, and the strategy-automation toggle. Pure
// presentational; HistoricTradePage wires the hooks.

export type SpeedOption = { value: number; label: string }

// Mirrors backend config.yaml `replay.speeds` (sim market-seconds per real
// second). UI-presentation values; the backend validates the choice.
export const SPEED_OPTIONS: SpeedOption[] = [
  { value: 1, label: '1× — real-time' },
  { value: 10, label: '10×' },
  { value: 30, label: '30×' },
  { value: 60, label: '60×' },
  { value: 300, label: '300×' },
  { value: 600, label: '600×' },
  { value: 1800, label: '1800×' },
  { value: 3600, label: '3600× — fastest' },
]

const STATUS_STYLE: Record<ReplayStatus, { cls: string; label: string; dot: string }> = {
  playing: { cls: 'chip-accent', label: 'Playing', dot: 'var(--accent)' },
  paused: { cls: 'chip-muted', label: 'Paused', dot: 'var(--text-muted)' },
  completed: { cls: 'chip-profit', label: 'Completed', dot: 'var(--profit)' },
  stopped: { cls: 'chip-muted', label: 'Stopped', dot: 'var(--text-muted)' },
}

function FieldLabel({ children, help }: { children: React.ReactNode; help?: Parameters<typeof HelpTooltip>[0]['helpKey'] }) {
  return (
    <span
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 'var(--fs-2xs, 10px)', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--text-muted)',
      }}
    >
      {children} {help && <HelpTooltip helpKey={help} />}
    </span>
  )
}

function simClock(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function ReplayControls({
  dates,
  selectedDate,
  onSelectDate,
  session,
  startAutomation,
  onToggleStartAutomation,
  startSpeed = 60,
  onSelectStartSpeed,
  onStart,
  onPlay,
  onPause,
  onStop,
  onSpeed,
  onToggleAutomation,
  busy = false,
}: {
  dates: string[]
  selectedDate: string
  onSelectDate(d: string): void
  session: ReplaySessionInfo | null
  startAutomation: boolean
  onToggleStartAutomation(enabled: boolean): void
  startSpeed?: number
  onSelectStartSpeed?(speed: number): void
  onStart(): void
  onPlay(): void
  onPause(): void
  onStop(): void
  onSpeed(speed: number): void
  onToggleAutomation(enabled: boolean): void
  busy?: boolean
}) {
  const active = session != null && session.status !== 'stopped'

  // ---- Start screen: a clean setup form -----------------------------------
  if (!active) {
    const noDates = dates.length === 0
    return (
      <div data-testid="replay-controls"
           style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6,
                       fontWeight: 600, fontSize: 'var(--fs-sm, 13px)' }}>
          Replay a stored session <HelpTooltip helpKey="replay" />
        </span>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <FieldLabel help="simulated_clock">Session date</FieldLabel>
            <select
              className="field"
              data-testid="replay-date-select"
              value={selectedDate}
              onChange={(e) => onSelectDate(e.target.value)}
              disabled={busy || noDates}
              style={{ width: 160 }}
            >
              {noDates && <option value="">no covered dates</option>}
              {dates.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <FieldLabel help="playback_speed">Playback speed</FieldLabel>
            <select
              className="field"
              data-testid="replay-speed-select"
              value={startSpeed}
              onChange={(e) => onSelectStartSpeed?.(Number(e.target.value))}
              disabled={busy}
              style={{ width: 170 }}
            >
              {SPEED_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>

          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, height: 40,
            padding: '0 12px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            fontSize: 'var(--fs-sm, 13px)', color: 'var(--text)',
          }}>
            <input
              type="checkbox"
              data-testid="replay-start-automation"
              checked={startAutomation}
              onChange={(e) => onToggleStartAutomation(e.target.checked)}
            />
            Watch the strategy <HelpTooltip helpKey="strategy_automation_replay" />
          </label>

          <button
            type="button"
            className="btn btn-primary"
            data-testid="replay-start"
            disabled={busy || !selectedDate}
            onClick={onStart}
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7 }}
          >
            <span aria-hidden>▶</span> Start replay
          </button>
        </div>
        {noDates && (
          <span className="stat-label">
            No covered sessions are available to replay — backfill SPY history on
            the Data page first.
          </span>
        )}
      </div>
    )
  }

  // ---- Active session: transport + live progress --------------------------
  const status = STATUS_STYLE[session.status]
  const pct = session.bars_total
    ? Math.round((session.bars_delivered / session.bars_total) * 100)
    : 0
  const completed = session.status === 'completed'
  const clock = simClock(session.sim_clock)

  return (
    <div data-testid="replay-controls"
         style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {/* identity: status + date + simulated clock */}
        <span className={`chip ${status.cls}`} data-testid="replay-status"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: status.dot }} />
          {status.label}
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="mono" style={{ fontWeight: 700, fontSize: 'var(--fs-md, 15px)' }}>
            {clock}
          </span>
          <span className="stat-label">
            {session.session_date} <HelpTooltip helpKey="simulated_clock" />
          </span>
        </span>

        {/* transport */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
          {completed ? (
            <button type="button" className="btn btn-primary" data-testid="replay-restart"
                    disabled={busy} onClick={onStart}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span aria-hidden>↻</span> Replay again
            </button>
          ) : session.status === 'playing' ? (
            <button type="button" className="btn btn-primary" data-testid="replay-pause"
                    disabled={busy} onClick={onPause}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span aria-hidden>⏸</span> Pause
            </button>
          ) : (
            <button type="button" className="btn btn-primary" data-testid="replay-play"
                    disabled={busy} onClick={onPlay}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span aria-hidden>▶</span> Play
            </button>
          )}
        </span>

        {/* settings: speed + automation (hidden once completed — nothing to tune) */}
        {!completed && (
          <>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <FieldLabel help="playback_speed">Speed</FieldLabel>
              <select
                className="field"
                data-testid="replay-speed-select"
                value={session.speed}
                onChange={(e) => onSpeed(Number(e.target.value))}
                disabled={busy}
                style={{ width: 150, padding: '6px 10px' }}
              >
                {SPEED_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                            fontSize: 'var(--fs-sm, 13px)', color: 'var(--text)' }}>
              <input
                type="checkbox"
                data-testid="replay-automation-toggle"
                checked={session.automation}
                onChange={(e) => onToggleAutomation(e.target.checked)}
                disabled={busy}
              />
              Automation <HelpTooltip helpKey="strategy_automation_replay" />
            </label>
          </>
        )}

        <button type="button" className="btn btn-ghost" data-testid="replay-stop"
                disabled={busy} onClick={onStop} style={{ marginLeft: 'auto' }}>
          {completed ? 'Close' : 'Stop'}
        </button>
      </div>

      {/* progress: a real bar with the readout beneath */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{
            height: 6, borderRadius: 'var(--r-pill, 999px)',
            background: 'var(--surface-2)', overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${pct}%`, height: '100%',
              background: completed ? 'var(--profit)' : 'var(--accent)',
              borderRadius: 'inherit',
              transition: 'width 240ms var(--ease, ease)',
            }}
          />
        </div>
        <span data-testid="replay-progress" className="stat-label mono"
              style={{ alignSelf: 'flex-end' }}>
          {session.bars_delivered}/{session.bars_total} bars · {pct}%
        </span>
      </div>
    </div>
  )
}
