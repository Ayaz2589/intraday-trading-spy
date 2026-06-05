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
//
// Handoff redesign: series identity colors come from the design system
// (accent / info / warn + neutral fallbacks) — green/red stay reserved for
// P&L semantics; the metric toggle is a segmented control.

const PALETTE = ['var(--accent)', 'var(--info)', 'var(--warn)', '#8b7cc8', '#6b8cae']

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
        xEnd: Date.parse(p.range_end),
        y: metricValue(p, metric) as number,
        label: `${p.range_start}..${p.range_end} · ${p.trades} trades · ${metricLabel(p, metric)}`,
        detail: [
          p.config_name ?? '(unknown config)',
          `${p.range_start} → ${p.range_end}`,
          `${p.trades} trades`,
          `net PnL $${Math.round(p.net_pnl).toLocaleString()}`,
          `expectancy ${p.expectancy_r != null ? p.expectancy_r.toFixed(3) : '—'} R · ` +
            `$${p.expectancy_dollars != null ? p.expectancy_dollars.toFixed(2) : '—'}/trade`,
          'click to open the window run →',
        ],
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <h3 className="card-title">
            <span className="card-accent" style={{ background: 'var(--accent)' }} />
            Edge time-series <HelpTooltip helpKey="edge_timeseries" />
          </h3>
          <span className="card-sub">
            One point per OOS window per config — click a point to open its window run
          </span>
        </div>
        <div className="seg" role="group" aria-label="Chart metric">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              className={metric === m.key ? 'seg-on' : undefined}
              aria-pressed={metric === m.key}
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
            height={320}
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
            <p className="chart-hint" style={{ marginTop: 4 }}>
              ⚠ raw $ is not comparable across configs run at different account
              sizes — use Expectancy R or Return % to compare.
            </p>
          )}
        </>
      )}
    </section>
  )
}
