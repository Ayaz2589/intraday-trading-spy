import { LineScatter, type LineScatterSeries } from '../charts/line-scatter'
import { HelpTooltip } from '../help-tooltip'
import type { EdgeTimeseriesPoint } from '@/api/types'

// Feature 016 (US2): one point per OOS window per config across the archive —
// the "is the edge stable or regime-bound?" view. Points click through to the
// window's child run.

const PALETTE = ['#6b8cae', '#b08c5a', '#7a9a6d', '#a06b8c', '#8c8c5a']

export function EdgeTimeseries({
  points,
  onOpenRun,
}: {
  points: EdgeTimeseriesPoint[]
  onOpenRun(runId: string): void
}) {
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
      .map((p) => ({
        x: Date.parse(p.range_start),
        y: p.net_pnl,
        label: `${p.range_start}..${p.range_end} · ${p.trades} trades · $${Math.round(p.net_pnl)}`,
        datum: p.run_id,
      })),
  }))

  return (
    <section className="card" data-testid="edge-timeseries">
      <header className="card-head">
        <h3 className="card-title">
          <span className="card-accent" style={{ background: 'var(--info)' }} />
          Edge time-series <HelpTooltip helpKey="edge_timeseries" />
        </h3>
      </header>
      {points.length === 0 ? (
        <p className="stat-label">
          No out-of-sample windows yet — run a walk-forward study and its
          validation windows will appear here, one point per window.
        </p>
      ) : (
        <LineScatter series={series} onPointClick={(d) => onOpenRun(d as string)} />
      )}
    </section>
  )
}
