import { SkipBack, Rewind, Play, Pause, FastForward, SkipForward, RotateCcw } from 'lucide-react'

interface Props {
  cursor: number
  count: number
  isPlaying: boolean
  speed: number
  direction: 1 | -1
  /** ISO timestamp of the currently-revealed bar, shown as ET time. */
  barTime?: string
  onToggle(): void
  onStep(dir: 1 | -1): void
  onScrub(cursor: number): void
  onReverse(): void
  onFastForward(): void
  onReset(): void
}

function etTime(iso?: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const ICON = 'h-4 w-4'

/**
 * Replay control bar for the run chart: step / reverse / play-pause /
 * fast-forward / step, a speed indicator, a scrubber, and the bar counter.
 * Presentational — all state lives in the caller (RunDetail's useReplay).
 */
export function PlaybackControls({
  cursor,
  count,
  isPlaying,
  speed,
  direction,
  barTime,
  onToggle,
  onStep,
  onScrub,
  onReverse,
  onFastForward,
  onReset,
}: Props) {
  const disabled = count <= 1
  const atStart = cursor <= 0
  const atEnd = cursor >= count - 1
  const accent = 'var(--accent)'

  const btn = (active: boolean, off: boolean): React.CSSProperties => ({
    color: active ? accent : undefined,
    opacity: off ? 0.4 : 1,
    cursor: off ? 'not-allowed' : 'pointer',
  })

  return (
    <div
      data-testid="playback-controls"
      className="card"
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px' }}
    >
      <button
        type="button"
        className="icon-btn"
        onClick={() => onStep(-1)}
        disabled={disabled || atStart}
        style={btn(false, disabled || atStart)}
        aria-label="Step back"
        title="Step back one bar"
      >
        <SkipBack className={ICON} />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={onReverse}
        disabled={disabled}
        style={btn(isPlaying && direction === -1, disabled)}
        aria-label="Reverse"
        title="Reverse (play backward)"
      >
        <Rewind className={ICON} />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={onToggle}
        disabled={disabled}
        style={btn(isPlaying, disabled)}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause className={ICON} /> : <Play className={ICON} />}
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={onFastForward}
        disabled={disabled}
        style={btn(isPlaying && direction === 1, disabled)}
        aria-label="Fast-forward"
        title="Fast-forward (cycle speed)"
      >
        <FastForward className={ICON} />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={() => onStep(1)}
        disabled={disabled || atEnd}
        style={btn(false, disabled || atEnd)}
        aria-label="Step forward"
        title="Step forward one bar"
      >
        <SkipForward className={ICON} />
      </button>

      <span
        className="mono"
        style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-muted)', width: 26, textAlign: 'center' }}
        aria-label={`Speed ${speed} times`}
      >
        {speed}×
      </span>

      <input
        type="range"
        min={0}
        max={Math.max(0, count - 1)}
        value={cursor}
        disabled={disabled}
        onChange={e => onScrub(Number(e.target.value))}
        aria-label="Replay position"
        data-testid="playback-scrubber"
        style={{ flex: 1, accentColor: accent, cursor: disabled ? 'not-allowed' : 'pointer' }}
      />

      <span
        className="mono"
        style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}
      >
        {cursor + 1}/{count}
        {barTime ? ` · ${etTime(barTime)} ET` : ''}
      </span>

      <button
        type="button"
        className="icon-btn"
        onClick={onReset}
        disabled={disabled}
        style={btn(false, disabled)}
        aria-label="Reset to full view"
        title="Reset (show full session)"
      >
        <RotateCcw className={ICON} />
      </button>
    </div>
  )
}
