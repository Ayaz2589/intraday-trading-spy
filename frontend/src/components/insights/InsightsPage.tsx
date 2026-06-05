import { useNavigate } from '@tanstack/react-router'
import { useConfigDistribution, useEdgeTimeseries } from '@/hooks/useInsights'
import { EdgeTimeseries } from './EdgeTimeseries'
import { ConfigDistribution } from './ConfigDistribution'
import { ClaudeReadCard, flattenMetrics, type VerdictBanner } from './ClaudeReadCard'
import type { EdgeTimeseriesPoint } from '@/api/types'

// Feature 016: the Insights page. Redesigned 2026-06-05 (user mockups):
// single full-width stack — header (title + subtitle + stat strip), edge
// time-series, per-config distribution, then Claude's read at the bottom
// with a gate-derived verdict banner. The old split right-rail is gone.

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
      data-testid="insights-stats"
      style={{
        display: 'flex',
        gap: 'var(--sp-6)',
        flexWrap: 'wrap',
        alignItems: 'baseline',
        marginTop: 'var(--sp-3)',
      }}
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

  // Verdict banner is DERIVED FROM THE SEEDED GATES (not Claude): red when
  // every computed gate failed, green if any config passes.
  const gated = (dist.data?.rows ?? []).filter((r) => r.gate_passed != null)
  const banner: VerdictBanner | undefined =
    gated.length === 0
      ? undefined
      : gated.some((r) => r.gate_passed)
        ? {
            tone: 'pass',
            title: 'A config passes the pooled gate — lockbox candidate',
            text: `${gated.filter((r) => r.gate_passed).length} of ${gated.length} computed gates exclude zero.`,
          }
        : {
            tone: 'fail',
            title: 'Not deployable — lockbox precondition unmet',
            text: `${gated.length} config gate${gated.length === 1 ? '' : 's'} computed; every pooled expectancy CI includes zero — the lockbox stays sealed.`,
          }

  return (
    <div
      className="content"
      data-testid="insights-page"
      style={{ padding: 16, display: 'grid', gap: 12, alignContent: 'start' }}
    >
      <header data-testid="insights-header">
        <h2 style={{ margin: 0 }}>Out-of-sample validation</h2>
        <p className="stat-label" style={{ margin: '4px 0 0' }}>
          Walk-forward studies pooled out-of-sample: every validation window
          across the archive, the regimes they crossed, the pooled gates, and
          Claude's read of the evidence.
        </p>
        <StatStrip
          points={edge.data?.points ?? []}
          fingerprint={edge.data?.snapshot_fingerprint}
        />
      </header>

      <EdgeTimeseries
        points={edge.data?.points ?? []}
        regimes={edge.data?.regimes ?? []}
        onOpenRun={(runId) => navigate({ to: '/runs/$runId', params: { runId } })}
      />

      <ConfigDistribution
        rows={dist.data?.rows ?? []}
        onOpenStudy={(studyId) => navigate({ to: '/validation/$studyId', params: { studyId } })}
      />

      <ClaudeReadCard
        scope="insights"
        banner={banner}
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
  )
}
