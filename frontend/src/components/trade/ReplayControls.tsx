import { HelpTooltip } from '../help-tooltip'
import type { ReplaySessionInfo } from '@/api/replay'

// Feature 022: the replay cockpit controls — date picker, transport
// (play/pause/stop), playback speed, and the strategy-automation toggle. Pure
// presentational; HistoricTradePage wires the hooks.

export type SpeedOption = { value: number; label: string }

// Mirrors backend config.yaml `replay.speeds` (sim market-seconds per real
// second). UI-presentation values; the backend validates the choice.
export const SPEED_OPTIONS: SpeedOption[] = [
  { value: 1, label: '1× (real-time)' },
  { value: 10, label: '10×' },
  { value: 30, label: '30×' },
  { value: 60, label: '60×' },
  { value: 300, label: '300×' },
  { value: 600, label: '600×' },
  { value: 1800, label: '1800×' },
  { value: 3600, label: '3600× (fastest)' },
]

export function ReplayControls({
  dates,
  selectedDate,
  onSelectDate,
  session,
  startAutomation,
  onToggleStartAutomation,
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
  onStart(): void
  onPlay(): void
  onPause(): void
  onStop(): void
  onSpeed(speed: number): void
  onToggleAutomation(enabled: boolean): void
  busy?: boolean
}) {
  const active = session != null && session.status !== 'stopped'

  if (!active) {
    return (
      <div data-testid="replay-controls"
           style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <span className="stat-label">
          replay a stored session <HelpTooltip helpKey="replay" />
        </span>
        <label className="stat-label" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          session date
          <select
            data-testid="replay-date-select"
            value={selectedDate}
            onChange={(e) => onSelectDate(e.target.value)}
            disabled={busy || dates.length === 0}
          >
            {dates.length === 0 && <option value="">no covered dates</option>}
            {dates.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="stat-label" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          speed <HelpTooltip helpKey="playback_speed" />
          <select
            data-testid="replay-speed-select"
            defaultValue={60}
            onChange={(e) => onSpeed(Number(e.target.value))}
            disabled={busy}
          >
            {SPEED_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            data-testid="replay-start-automation"
            checked={startAutomation}
            onChange={(e) => onToggleStartAutomation(e.target.checked)}
          />
          watch the strategy <HelpTooltip helpKey="strategy_automation_replay" />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          data-testid="replay-start"
          disabled={busy || !selectedDate}
          onClick={onStart}
        >
          Start replay
        </button>
      </div>
    )
  }

  const pct = session.bars_total
    ? Math.round((session.bars_delivered / session.bars_total) * 100)
    : 0

  return (
    <div data-testid="replay-controls"
         style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span className="chip chip-muted" data-testid="replay-status">{session.status}</span>
      <span className="stat-label">
        {session.session_date} <HelpTooltip helpKey="simulated_clock" />
      </span>

      {session.status === 'playing' ? (
        <button type="button" className="btn btn-ghost" data-testid="replay-pause"
                disabled={busy} onClick={onPause}>
          Pause
        </button>
      ) : (
        <button type="button" className="btn btn-primary" data-testid="replay-play"
                disabled={busy || session.status === 'completed'} onClick={onPlay}>
          Play
        </button>
      )}

      <label className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        speed <HelpTooltip helpKey="playback_speed" />
        <select
          data-testid="replay-speed-select"
          value={session.speed}
          onChange={(e) => onSpeed(Number(e.target.value))}
          disabled={busy}
        >
          {SPEED_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </label>

      <label className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          data-testid="replay-automation-toggle"
          checked={session.automation}
          onChange={(e) => onToggleAutomation(e.target.checked)}
          disabled={busy}
        />
        automation <HelpTooltip helpKey="strategy_automation_replay" />
      </label>

      <span className="stat-label mono" data-testid="replay-progress">
        {session.bars_delivered}/{session.bars_total} bars · {pct}%
      </span>

      <button type="button" className="btn btn-ghost" data-testid="replay-stop"
              disabled={busy} onClick={onStop} style={{ marginLeft: 'auto' }}>
        Stop
      </button>
    </div>
  )
}
