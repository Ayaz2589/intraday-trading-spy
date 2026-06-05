import { SectionTitle, cardSection } from '../section-title'
import { HelpTooltip } from '../help-tooltip'
import type { SensitivitySurface } from '@/api/types'

// Feature 014 (FR-007/FR-011): the sensitivity grid as a table — one row per
// point with its coords, metric, trades, and a "View run →" link gated on
// `persisted` (absent in pre-014 results → no link).

export function SensitivityPointsTable({ surface }: { surface: SensitivitySurface }) {
  const points = surface.points ?? []

  return (
    <section style={cardSection}>
      <SectionTitle
        title="Grid points"
        subtitle="every evaluated knob combination — drill into any point's full backtest"
      >
        <HelpTooltip helpKey="study_drilldown" />
      </SectionTitle>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm, 13px)' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 'var(--fs-xs, 11px)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <th style={{ padding: '4px 8px' }}>Point</th>
            <th style={{ padding: '4px 8px' }}>{surface.metric_name}</th>
            <th style={{ padding: '4px 8px' }}>Trades</th>
            <th style={{ padding: '4px 8px' }} />
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={i} data-testid={`point-row-${i}`} style={{ borderTop: '1px solid var(--border)' }}>
              <td className="mono" style={{ padding: '6px 8px' }}>
                {Object.entries(p.coords)
                  .map(([k, v]) => `${k.split('.').pop()}=${v}`)
                  .join(' · ')}
              </td>
              <td className="mono" style={{ padding: '6px 8px' }}>
                {p.metric == null ? '—' : p.metric.toFixed(2)}
                {p.low_confidence ? ' ⚠' : ''}
              </td>
              <td className="mono" style={{ padding: '6px 8px' }}>{p.trade_count}</td>
              <td style={{ padding: '6px 8px' }}>
                {p.persisted === true && (
                  <a href={`/runs/${p.run_id}`} style={{ color: 'var(--accent, #2563eb)', fontWeight: 600 }}>
                    View run →
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
