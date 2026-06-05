import { useState } from 'react'
import { LineScatter, type LineScatterBand, type LineScatterSeries } from '../charts/line-scatter'
import { HelpTooltip } from '../help-tooltip'
import type { EdgeTimeseriesPoint, RegimeView } from '@/api/types'

// Feature 016 (US2): one point per OOS window per config across the archive —
// the "is the edge stable or regime-bound?" view. Points click through to the
// window's child run.
//
// 016-polish: $ values are NOT comparable across configs run at different
// account sizes ($2.5M default vs $1k wf-rr3), so the default metric is
// Expectancy R (risk-normalized); Return-%-of-account and raw PnL $ are a
// toggle away. Labeled market regimes shade behind the series.

const PALETTE = ['#6b8cae', '#b08c5a', '#7a9a6d', '#a06b8c', '#8c8c5a']

type Metric = 'r' | 'pct' | 'usd'

const METRICS: { key: Metric; label: string }[] = [
  { key: 'r', label: 'Expectancy R' },
  { key: 'pct', label: 'Return %' },
  { key: 'usd', label: 'PnL $' },
]

function metricValue(p: EdgeTimeseriesPoint, metric: Metric): number | null {
  if (metric === 'r') return p.expectancy_r
  if (metric === 'pct') return p.account_value ? (p.net_pnl / p.account_value) * 100 : null
  return p.net_pnl
}

function metricLabel(p: EdgeTimeseriesPoint, metric: Metric): string {
  const v = metricValue(p, metric)
  if (v == null) return '—'
  if (metric === 'r') return `${v.toFixed(3)} R`
  if (metric === 'pct') return `${v.toFixed(1)}%`
  return `$${Math.round(v).toLocaleString()}`
}

export function EdgeTimeseries({
  points,
  regimes = [],
  onOpenRun,
}: {
  points: EdgeTimeseriesPoint[]
  regimes?: RegimeView[]
  onOpenRun(runId: string): void
}) {
  const [metric, setMetric] = useState<Metric>('r')

  const byConfig = new Map<string, EdgeTimeseriesPoint[]>()
  for (const p of points) {
    const key = p.config_name ?? '(unknown config)'
    byConfig.set(key, [...(byConfig.get(key) ?? []), p])
  }
  const series: LineScatterSeries[] = [...byConfig.entries()].map(([id, pts], i) => ({
    id,
    color: PALETTE[i % PALETTE.length],
    points: pts
      .slice()
      .sort((a, b) => a.range_start.localeCompare(b.range_start))
      .filter((p) => metricValue(p, metric) != null)
      .map((p) => ({
        x: Date.parse(p.range_start),
        y: metricValue(p, metric) as number,
        label: `${p.range_start}..${p.range_end} · ${p.trades} trades · ${metricLabel(p, metric)}`,
        datum: p.run_id,
      })),
  }))

  const bands: LineScatterBand[] = regimes.map((r) => ({
    from: Date.parse(r.start),
    to: Date.parse(r.end),
    label: r.name,
  }))

  return (
    <section className="card" data-testid="edge-timeseries">
      <header className="card-head">
        <h3 className="card-title">
          <span className="card-accent" style={{ background: 'var(--info)' }} />
          Edge time-series <HelpTooltip helpKey="edge_timeseries" />
        </h3>
        <div style={{ display: 'flex', gap: 4 }}>
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              className="btn"
              aria-pressed={metric === m.key}
              style={
                metric === m.key ? { borderColor: 'var(--info)', color: 'var(--info)' } : undefined
              }
              onClick={() => setMetric(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </header>
      {points.length === 0 ? (
        <p className="stat-label">
          No out-of-sample windows yet — run a walk-forward study and its
          validation windows will appear here, one point per window.
        </p>
      ) : (
        <>
          <LineScatter
            series={series}
            bands={bands}
            formatY={(v) =>
              metric === 'r'
                ? v.toFixed(2)
                : metric === 'pct'
                  ? `${v.toFixed(1)}%`
                  : `$${Math.round(v).toLocaleString()}`
            }
            formatX={(v) => String(new Date(v).getUTCFullYear())}
            onPointClick={(d) => onOpenRun(d as string)}
          />
          {metric === 'usd' && byConfig.size > 1 && (
            <p className="stat-label" style={{ marginTop: 4 }}>
              ⚠ raw $ is not comparable across configs run at different account
              sizes — use Expectancy R or Return % to compare.
            </p>
          )}
        </>
      )}
    </section>
  )
}
