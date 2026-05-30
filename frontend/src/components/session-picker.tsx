// SessionPicker — 2-line day-tab cards per design handoff's .day-tab styling.
// Spec FR-001 visual cohesion; matches the chart-card day tabs.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function shortDate(iso: string): string {
  // YYYY-MM-DD → MM-DD
  return iso.slice(5);
}

function weekday(iso: string): string {
  // Treat as YYYY-MM-DD in local time; use UTC parse via Date constructor
  // appended T12:00 to avoid timezone-shift surprises.
  const d = new Date(`${iso}T12:00:00`);
  return WEEKDAYS[d.getDay()] ?? "—";
}

export function SessionPicker({
  sessions,
  selected,
  onChange,
}: {
  sessions: string[];
  selected: string;
  onChange: (session: string) => void;
}) {
  if (sessions.length <= 1) return null;
  return (
    <div className="day-tabs" role="tablist" aria-label="Session day">
      {sessions.map((s) => {
        const isActive = s === selected;
        return (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={isActive ? "day-tab day-on" : "day-tab"}
            onClick={() => onChange(s)}
          >
            <span className="day-dow">{weekday(s)}</span>
            <span className="day-date mono">{shortDate(s)}</span>
          </button>
        );
      })}
    </div>
  );
}
