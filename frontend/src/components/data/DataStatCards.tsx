import type { BarsStatsResponse } from '@/api/bars'

// Data-page redesign: the four stat cards across the top — CACHED BARS,
// SESSIONS, COVERAGE SPAN (with a fill bar = sessions present/expected),
// SOURCES (primary/fallback chips mirroring data.source_preference order).

const cardStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 170,
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

export function DataStatCards({ stats }: { stats: BarsStatsResponse }) {
  const { totals, months } = stats
  const expected = months.reduce((n, m) => n + m.sessions_expected, 0)
  const present = months.reduce((n, m) => n + m.sessions_present, 0)
  const fillPct = expected > 0 ? Math.round((present / expected) * 100) : 0

  return (
    <div data-testid="stat-cards" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <div style={cardStyle}>
        <div style={labelStyle}>Cached bars</div>
        <div style={valueStyle}>{totals.bars.toLocaleString()}</div>
        <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>SPY · 5-minute</div>
      </div>
      <div style={cardStyle}>
        <div style={labelStyle}>Sessions</div>
        <div style={valueStyle}>{totals.sessions.toLocaleString()}</div>
        <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>NYSE trading days</div>
      </div>
      <div style={{ ...cardStyle, minWidth: 220 }}>
        <div style={labelStyle}>Coverage span</div>
        <div style={{ ...valueStyle, fontSize: 'var(--fs-base, 15px)' }}>
          {totals.earliest ?? '—'} <span style={{ color: 'var(--accent, #2563eb)' }}>→</span> {totals.latest ?? '—'}
        </div>
        <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-2, #eee)', overflow: 'hidden' }}>
          <div
            style={{
              width: `${fillPct}%`,
              height: '100%',
              borderRadius: 999,
              background: 'linear-gradient(90deg, var(--accent, #2563eb), #60a5fa)',
            }}
          />
        </div>
      </div>
      <div style={cardStyle}>
        <div style={labelStyle}>Sources</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
          {totals.sources.length === 0 && <span style={{ color: 'var(--text-muted)' }}>—</span>}
          {totals.sources.map((s, i) => (
            <span key={s} data-testid={`source-${s}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-sm, 13px)' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: i === 0 ? 'var(--pos, #16a34a)' : 'var(--accent, #2563eb)', display: 'inline-block' }} />
              <strong>{s}</strong>
              <span
                style={{
                  fontSize: 'var(--fs-xs, 10px)',
                  padding: '0 7px',
                  borderRadius: 999,
                  background: 'var(--surface-2, #eef)',
                  color: 'var(--text-muted)',
                }}
              >
                {/* Mirrors data.source_preference: the first source wins reads. */}
                {i === 0 ? 'primary' : 'fallback'}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
