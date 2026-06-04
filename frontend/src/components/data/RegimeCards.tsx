import type { RegimeCoverage } from '@/api/bars'

// Data-page redesign: the regime completeness table becomes cards — one per
// labeled market regime, with the big % and a covered/gap pill (testids kept
// from the old table so existing assertions hold).

export function RegimeCards({ regimes }: { regimes: RegimeCoverage[] }) {
  if (regimes.length === 0) return null
  return (
    <div data-testid="regime-cards" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {regimes.map((r) => (
        <div
          key={r.name}
          data-testid={`regime-row-${r.name}`}
          style={{
            flex: 1,
            minWidth: 180,
            padding: '10px 12px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md, 10px)',
            background: 'var(--surface, #fff)',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm, 13px)' }}>{r.name}</div>
          <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
            {r.present_sessions} / {r.expected_sessions} sessions
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0' }}>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: r.covered ? 'var(--pos, #1a7f37)' : 'var(--neg, #b42318)' }}>
              {r.completeness_pct}%
            </span>
            <span
              data-testid={`regime-status-${r.name}`}
              style={{
                padding: '1px 8px',
                borderRadius: 999,
                fontSize: 'var(--fs-xs, 11px)',
                fontWeight: 600,
                color: r.covered ? 'var(--pos, #1a7f37)' : 'var(--neg, #b42318)',
                background: r.covered ? 'var(--pos-bg, #e6f4ea)' : 'var(--neg-bg, #fdecea)',
              }}
            >
              {r.covered ? 'covered' : 'gap'}
            </span>
          </div>
          <div style={{ height: 4, borderRadius: 999, background: 'var(--surface-2, #eee)', overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min(100, r.completeness_pct)}%`,
                height: '100%',
                background: r.covered ? 'var(--pos, #16a34a)' : 'var(--neg, #b42318)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
