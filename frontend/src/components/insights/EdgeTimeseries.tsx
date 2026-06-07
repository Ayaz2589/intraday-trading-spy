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
const DEFAULT_SERIES = 5

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

  // Campaign series minted dozens of configs — plotting all of them is
  // spaghetti. Rank by pooled OOS trades, show the top few by default, and
  // give every config a toggle chip. Colors are stable per ranked position.
  const ranked = [...byConfig.entries()]
    .map(([id, pts]) => ({ id, trades: pts.reduce((a, p) => a + p.trades, 0) }))
    .sort((a, b) => b.trades - a.trades || a.id.localeCompare(b.id))
  const defaultVisible = new Set(ranked.slice(0, DEFAULT_SERIES).map((r) => r.id))
  const [picked, setPicked] = useState<Set<string> | null>(null) // null = top-N default
  const visible = picked ?? defaultVisible
  const toggleConfig = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev ?? defaultVisible)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const series: LineScatterSeries[] = ranked
    .map(({ id }, i) => ({ id, i, pts: byConfig.get(id) ?? [] }))
    .filter(({ id }) => visible.has(id))
    .map(({ id, i, pts }) => ({
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
            legend={false}
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
          <div
            data-testid="edge-legend"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 6,
              marginTop: 8,
            }}
          >
            {ranked.map((r, i) => {
              const on = visible.has(r.id)
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleConfig(r.id)}
                  className="mono"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '2px 8px',
                    borderRadius: 999,
                    border: '1px solid var(--border)',
                    background: on ? 'var(--surface-2)' : 'transparent',
                    color: on ? 'var(--text)' : 'var(--text-muted)',
                    fontSize: 'var(--fs-xs, 11px)',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: PALETTE[i % PALETTE.length],
                      opacity: on ? 1 : 0.35,
                    }}
                  />
                  {r.id}
                </button>
              )
            })}
            {ranked.length > DEFAULT_SERIES && (
              <span style={{ display: 'inline-flex', gap: 4, marginLeft: 'auto' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: 'var(--fs-xs, 11px)', padding: '2px 8px' }}
                  onClick={() => setPicked(new Set(ranked.map((r) => r.id)))}
                >
                  show all {ranked.length}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: 'var(--fs-xs, 11px)', padding: '2px 8px' }}
                  onClick={() => setPicked(null)}
                >
                  top {DEFAULT_SERIES}
                </button>
              </span>
            )}
          </div>
          {ranked.length > visible.size && (
            <p className="chart-hint" style={{ marginTop: 4 }}>
              showing {visible.size} of {ranked.length} configs (top {DEFAULT_SERIES} by
              OOS trades by default) — click a chip to toggle a config
            </p>
          )}
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
