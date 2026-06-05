import { CalendarField } from './calendar-field'

// Run-viewer session scale fix (post-014): study child runs can span years
// (250+ sessions), which overflowed the old chip-strip SessionPicker. This
// replaces it with prev/next arrows + the Data-page CalendarField. Calendar
// picks on non-trading days snap to the nearest session (ties go earlier).

export function snapToSession(sessions: string[], iso: string): string {
  if (sessions.length === 0) return iso
  let best = sessions[0]
  let bestDist = Number.POSITIVE_INFINITY
  const target = Date.parse(`${iso}T12:00:00`)
  for (const s of sessions) {
    const dist = Math.abs(Date.parse(`${s}T12:00:00`) - target)
    if (dist < bestDist) {
      best = s
      bestDist = dist
    }
  }
  return best
}

const arrowStyle: React.CSSProperties = {
  padding: '4px 10px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm, 6px)',
  background: 'var(--surface-2, #f6f7f9)',
  color: 'var(--text)',
  fontSize: 'var(--fs-sm, 13px)',
  fontWeight: 600,
  cursor: 'pointer',
  lineHeight: 1.2,
}

export function SessionCalendarPicker({
  sessions,
  selected,
  onChange,
}: {
  sessions: string[]
  selected: string
  onChange: (session: string) => void
}) {
  if (sessions.length <= 1) return null

  const idx = sessions.indexOf(selected)
  const atStart = idx <= 0
  const atEnd = idx === sessions.length - 1 || idx === -1

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        aria-label="Previous session"
        disabled={atStart}
        onClick={() => onChange(sessions[idx - 1])}
        style={{ ...arrowStyle, opacity: atStart ? 0.4 : 1, cursor: atStart ? 'default' : 'pointer' }}
      >
        ←
      </button>
      <CalendarField
        value={selected}
        min={sessions[0]}
        max={sessions[sessions.length - 1]}
        onChange={(iso) => onChange(snapToSession(sessions, iso))}
        ariaLabel="Session day"
        testid="session-calendar"
      />
      <button
        type="button"
        aria-label="Next session"
        disabled={atEnd}
        onClick={() => onChange(sessions[idx + 1])}
        style={{ ...arrowStyle, opacity: atEnd ? 0.4 : 1, cursor: atEnd ? 'default' : 'pointer' }}
      >
        →
      </button>
      <span
        data-testid="session-position"
        className="mono"
        style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}
      >
        {idx + 1} / {sessions.length} sessions
      </span>
    </div>
  )
}
