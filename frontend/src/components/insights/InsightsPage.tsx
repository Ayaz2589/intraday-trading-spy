import { useNavigate } from '@tanstack/react-router'
import { useConfigDistribution, useEdgeTimeseries } from '@/hooks/useInsights'
import { EdgeTimeseries } from './EdgeTimeseries'
import { ConfigDistribution } from './ConfigDistribution'
import { ClaudeReadCard, flattenMetrics } from './ClaudeReadCard'
import type { EdgeTimeseriesPoint } from '@/api/types'

// Feature 016: the Insights page — split Layout A (chosen via visual
// companion): charts column left 2/3, advisory right rail.
// 016-polish: headline stat strip summarizing the OOS archive at a glance.

function StatStrip({ points, fingerprint }: { points: EdgeTimeseriesPoint[]; fingerprint?: string }) {
  if (points.length === 0) return null
  const configs = new Set(points.map((p) => p.config_name ?? '?')).size
  const trades = points.reduce((a, p) => a + p.trades, 0)
  const positive = points.filter((p) => p.net_pnl > 0).length
  const starts = points.map((p) => p.range_start).sort()
  const ends = points.map((p) => p.range_end).sort()
  const stats: [string, string][] = [
    ['OOS windows', String(points.length)],
    ['OOS trades', trades.toLocaleString()],
    ['configs', `${configs} config${configs === 1 ? '' : 's'}`],
    ['windows +', `${positive} / ${points.length} positive`],
    ['span', `${starts[0]} → ${ends[ends.length - 1]}`],
  ]
  return (
    <div
      className="card"
      data-testid="insights-stats"
      style={{ display: 'flex', gap: 'var(--sp-6)', flexWrap: 'wrap', alignItems: 'baseline' }}
    >
      {stats.map(([label, value]) => (
        <div key={label}>
          <div className="stat-label">{label}</div>
          <div className="mono" style={{ fontWeight: 600 }}>
            {value}
          </div>
        </div>
      ))}
      {fingerprint && (
        <div style={{ marginLeft: 'auto' }}>
          <div className="stat-label">snapshot</div>
          <div className="mono stat-label">{fingerprint.slice(0, 8)}</div>
        </div>
      )}
    </div>
  )
}

export function InsightsPage() {
  const navigate = useNavigate()
  const edge = useEdgeTimeseries()
  const dist = useConfigDistribution()

  return (
    <div
      className="content"
      data-testid="insights-page"
      style={{
        padding: 16,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)',
        gap: 12,
        alignItems: 'start',
      }}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <StatStrip
          points={edge.data?.points ?? []}
          fingerprint={edge.data?.snapshot_fingerprint}
        />
        <EdgeTimeseries
          points={edge.data?.points ?? []}
          regimes={edge.data?.regimes ?? []}
          onOpenRun={(runId) => navigate({ to: '/runs/$runId', params: { runId } })}
        />
        <ConfigDistribution
          rows={dist.data?.rows ?? []}
          onOpenStudy={(studyId) =>
            navigate({ to: '/validation/$studyId', params: { studyId } })
          }
        />
      </div>

      <div
        data-testid="insights-right-rail"
        style={{ position: 'sticky', top: 12, display: 'grid', gap: 12 }}
      >
        <ClaudeReadCard
          scope="insights"
          currentFingerprints={{
            timeseries: edge.data?.snapshot_fingerprint ?? null,
            distribution: dist.data?.snapshot_fingerprint ?? null,
          }}
          metricValues={flattenMetrics({
            timeseries: { points: edge.data?.points ?? [] },
            distribution: { rows: dist.data?.rows ?? [] },
          })}
        />
      </div>
    </div>
  )
}
