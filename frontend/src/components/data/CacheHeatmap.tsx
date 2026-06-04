import type { MonthStat, MonthState } from '@/api/bars'

// Feature 013 US2/US3: the year×month cache-completeness heatmap. Pure
// presentation over the server-derived MonthStat rows — all calendar logic
// (what counts as a session, holidays) lives server-side. A partial cell's
// hover lists the EXACT missing trading days; holidays are already excluded,
// so every listed day is a real gap.

const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const CELL_COLOR: Record<MonthState | 'blank', string> = {
  complete: 'var(--pos, #16a34a)',
  partial: 'var(--warn, #f59e0b)',
  current: 'var(--accent-muted, #93c5fd)',
  future: 'var(--surface-2, #e5e7eb)',
  blank: 'transparent',
}

function cellTitle(m: MonthStat): string {
  const [y, mo] = m.month.split('-')
  const label = `${MONTH_NAMES[Number(mo) - 1]} ${y}`
  if (m.state === 'future') return `${label} · not cached`
  if (m.state === 'current') {
    return `${label} · ${m.sessions_present}/${m.sessions_expected} sessions so far · ${m.bars.toLocaleString()} bars · in progress`
  }
  const base = `${label} · ${m.sessions_present}/${m.sessions_expected} sessions · ${m.bars.toLocaleString()} bars`
  if (m.state === 'partial') return `${base} · missing: ${m.missing_dates.join(', ')}`
  return `${base} · complete`
}

export function CacheHeatmap({ months }: { months: MonthStat[] }) {
  if (months.length === 0) return null
  const byKey = new Map(months.map((m) => [m.month, m]))
  const years: number[] = []
  const firstYear = Number(months[0].month.slice(0, 4))
  const lastYear = Number(months[months.length - 1].month.slice(0, 4))
  for (let y = firstYear; y <= lastYear; y++) years.push(y)

  return (
    <div data-testid="cache-heatmap" style={{ marginTop: 8 }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 3, fontSize: 'var(--fs-xs, 11px)' }}>
        <thead>
          <tr>
            <th aria-hidden style={{ width: 38 }} />
            {MONTH_LABELS.map((l, i) => (
              <th key={i} style={{ color: 'var(--text-muted)', fontWeight: 400, width: 22, textAlign: 'center' }}>
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map((y) => (
            <tr key={y} data-testid={`heatrow-${y}`}>
              <td style={{ color: 'var(--text-muted)', paddingRight: 4 }}>{y}</td>
              {MONTH_NAMES.map((_, i) => {
                const key = `${y}-${String(i + 1).padStart(2, '0')}`
                const m = byKey.get(key)
                if (!m) {
                  return <td key={key} data-state="blank" style={{ width: 22, height: 18 }} />
                }
                return (
                  <td
                    key={key}
                    data-testid={`heatcell-${key}`}
                    data-state={m.state}
                    title={cellTitle(m)}
                    style={{
                      width: 22,
                      height: 18,
                      borderRadius: 4,
                      cursor: 'help',
                      background: CELL_COLOR[m.state],
                      opacity: m.state === 'future' ? 0.6 : 1,
                    }}
                  />
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div
        data-testid="heatmap-legend"
        style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', flexWrap: 'wrap' }}
      >
        {(['complete', 'partial', 'current', 'future'] as const).map((state) => (
          <span key={state} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: CELL_COLOR[state], display: 'inline-block' }} />
            {state === 'current' ? 'current month' : state === 'future' ? 'future / not cached' : state}
          </span>
        ))}
      </div>
    </div>
  )
}
