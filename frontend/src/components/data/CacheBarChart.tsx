import type { MonthStat, MonthState } from '@/api/bars'

// Data-page redesign: monthly completeness as a bar chart (replaces the grid
// heatmap; user-approved 2026-06-04). Bar height ∝ sessions cached that month.
// Pure presentation — all calendar logic stays server-side. A partial bar's
// hover lists the EXACT missing trading days (holidays already excluded).

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const BAR_COLOR: Record<MonthState, string> = {
  complete: 'var(--pos, #16a34a)',
  partial: 'var(--warn, #f59e0b)',
  current: 'var(--accent-muted, #60a5fa)',
  future: 'var(--surface-2, #e5e7eb)',
}

const CHART_HEIGHT = 56 // px for a full month (~23 sessions)

function barTitle(m: MonthStat): string {
  const [y, mo] = m.month.split('-')
  const label = `${MONTH_ABBR[Number(mo) - 1]} ${y}`
  if (m.state === 'future') return `${label} · not cached`
  if (m.state === 'current') {
    return `${label} · ${m.sessions_present}/${m.sessions_expected} sessions so far · ${m.bars.toLocaleString()} bars · in progress`
  }
  const base = `${label} · ${m.sessions_present}/${m.sessions_expected} sessions · ${m.bars.toLocaleString()} bars`
  if (m.state === 'partial') return `${base} · missing: ${m.missing_dates.join(', ')}`
  return `${base} · complete`
}

function summaryLine(months: MonthStat[]): string {
  const complete = months.filter((m) => m.state === 'complete').length
  const partial = months.filter((m) => m.state === 'partial').length
  const future = months.filter((m) => m.state === 'future').length
  const current = months.find((m) => m.state === 'current')
  const parts: string[] = [`${complete} month${complete === 1 ? '' : 's'} fully cached`]
  if (partial > 0) parts.push(`${partial} month${partial === 1 ? '' : 's'} with gaps`)
  if (current) {
    const [y, mo] = current.month.split('-')
    parts.push(`${MONTH_NAMES[Number(mo) - 1]} ${y} in progress`)
  }
  if (future > 0) parts.push(`${future} month${future === 1 ? '' : 's'} ahead not yet cached`)
  return parts.join(' · ')
}

export function CacheBarChart({ months }: { months: MonthStat[] }) {
  if (months.length === 0) return null
  const maxSessions = Math.max(1, ...months.map((m) => Math.max(m.sessions_expected, m.sessions_present)))

  // Year groups, in order, for the axis labels.
  const years: Array<{ year: string; months: MonthStat[] }> = []
  for (const m of months) {
    const year = m.month.slice(0, 4)
    const last = years[years.length - 1]
    if (last && last.year === year) last.months.push(m)
    else years.push({ year, months: [m] })
  }

  return (
    <div data-testid="cache-bar-chart" style={{ marginTop: 8 }}>
      <p data-testid="chart-summary" style={{ margin: '0 0 10px', fontSize: 'var(--fs-sm, 13px)' }}>
        {summaryLine(months)}
      </p>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
        {years.map((g) => (
          <div key={g.year} style={{ display: 'flex', flexDirection: 'column', flexGrow: g.months.length }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: CHART_HEIGHT }}>
              {g.months.map((m) => {
                const h = m.state === 'future' ? 3 : Math.max(3, Math.round((m.sessions_present / maxSessions) * CHART_HEIGHT))
                return (
                  <div
                    key={m.month}
                    data-testid={`bar-${m.month}`}
                    data-state={m.state}
                    title={barTitle(m)}
                    style={{
                      flex: 1,
                      minWidth: 4,
                      height: h,
                      borderRadius: 2,
                      cursor: 'help',
                      background: BAR_COLOR[m.state],
                      opacity: m.state === 'future' ? 0.7 : 1,
                    }}
                  />
                )
              })}
            </div>
            <div
              data-testid={`year-label-${g.year}`}
              style={{ textAlign: 'center', marginTop: 4, fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}
            >
              {g.year}
            </div>
          </div>
        ))}
      </div>
      <div
        data-testid="chart-legend"
        style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', flexWrap: 'wrap' }}
      >
        {(
          [
            ['complete', 'complete'],
            ['partial', 'gaps'],
            ['current', 'in progress'],
            ['future', 'not cached'],
          ] as Array<[MonthState, string]>
        ).map(([state, label]) => (
          <span key={state} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: BAR_COLOR[state], display: 'inline-block' }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
