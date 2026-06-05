import { useNavigate } from '@tanstack/react-router'
import { useConfigDistribution, useEdgeTimeseries } from '@/hooks/useInsights'
import { EdgeTimeseries } from './EdgeTimeseries'
import { ConfigDistribution } from './ConfigDistribution'
import { ClaudeReadCard, flattenMetrics, type VerdictBanner } from './ClaudeReadCard'
import type { ConfigDistributionRow, EdgeTimeseriesPoint } from '@/api/types'

// Feature 016: the Insights page. Redesigned 2026-06-05 (design handoff,
// Validation page): run-header page chrome, then a metric hero (the
// data-coverage cov-hero pattern) carrying the OOS stat strip + a
// gate-verdict footer pill, then edge time-series, per-config distribution,
// and Claude's read at the bottom. Single full-width stack — no right rail.

// Compact pooled-gate verdict for the hero footer. The detailed banner (with
// the determinism-split honesty note) still headlines Claude's read below —
// this pill is the at-a-glance echo, like the data page's health pill.
function GatePill({ gated }: { gated: ConfigDistributionRow[] }) {
  if (gated.length === 0) {
    return (
      <span className="health-pill health-pill-faint" data-testid="insights-gate-pill">
        — no pooled gate computed yet
      </span>
    )
  }
  const passed = gated.filter((r) => r.gate_passed).length
  if (passed > 0) {
    return (
      <span className="health-pill" data-testid="insights-gate-pill">
        <span aria-hidden>✓</span> {passed} of {gated.length} pooled gate
        {gated.length === 1 ? '' : 's'} pass — lockbox candidate
      </span>
    )
  }
  return (
    <span className="health-pill health-pill-loss" data-testid="insights-gate-pill">
      <span aria-hidden>✕</span> no config passes the pooled gate — every CI includes zero
    </span>
  )
}

function ArchiveHero({
  points,
  fingerprint,
  gated,
}: {
  points: EdgeTimeseriesPoint[]
  fingerprint?: string
  gated: ConfigDistributionRow[]
}) {
  if (points.length === 0) return null
  const configs = [...new Set(points.map((p) => p.config_name ?? '?'))]
  const trades = points.reduce((a, p) => a + p.trades, 0)
  const positive = points.filter((p) => p.net_pnl > 0).length
  const starts = points.map((p) => p.range_start).sort()
  const ends = points.map((p) => p.range_end).sort()
  return (
    <div className="hero" data-testid="insights-stats">
      <div className="hero-top">
        <div className="hero-metric">
          <span className="hero-metric-label">OOS windows</span>
          <span className="hero-metric-value">{points.length}</span>
          <span className="hero-metric-sub">one per walk-forward validation window</span>
        </div>
        <div className="hero-metric">
          <span className="hero-metric-label">OOS trades</span>
          <span className="hero-metric-value">{trades.toLocaleString()}</span>
          <span className="hero-metric-sub">pooled across all windows</span>
        </div>
        <div className="hero-metric">
          <span className="hero-metric-label">Configs</span>
          <span className="hero-metric-value">
            {configs.length}
            <span className="unit">config{configs.length === 1 ? '' : 's'}</span>
          </span>
          <span className="hero-metric-sub mono">{configs.join(' · ')}</span>
        </div>
        <div className="hero-metric">
          <span className="hero-metric-label">Windows positive</span>
          <span className="hero-metric-value">
            {positive}
            <span className="unit">/ {points.length} positive</span>
          </span>
          <div className="win-bar" style={{ marginTop: 6 }}>
            <span
              className="win-fill"
              style={{ width: `${Math.round((positive / points.length) * 100)}%` }}
            />
          </div>
        </div>
        <div className="hero-metric hero-span">
          <span className="hero-metric-label">Span</span>
          <span className="hero-span-dates">
            {starts[0]} <span className="hero-span-arrow">→</span> {ends[ends.length - 1]}
          </span>
          <div className="span-bar">
            <span />
          </div>
        </div>
      </div>
      <div className="hero-foot">
        <GatePill gated={gated} />
        {fingerprint && (
          <span className="hero-foot-meta" data-testid="insights-snapshot">
            snapshot <b className="mono">{fingerprint.slice(0, 8)}</b>
          </span>
        )}
        <span className="hero-foot-note">
          pooled out-of-sample evidence — in-sample fits never appear here
        </span>
      </div>
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
      data-testid="insights-page"
      style={{ padding: 'var(--sp-6) var(--sp-8) var(--sp-12)' }}
    >
      <div className="run-header">
        <header data-testid="insights-header">
          <div className="rh-main">
            <h1 className="rh-title" style={{ fontFamily: 'var(--font-sans)' }}>
              Out-of-sample validation
            </h1>
          </div>
          <div className="rh-meta">
            <span>
              Walk-forward studies pooled out-of-sample: every validation window
              across the archive, the regimes they crossed, the pooled gates, and
              Claude's read of the evidence.
            </span>
          </div>
        </header>
      </div>

      <div className="content">
        <ArchiveHero
          points={edge.data?.points ?? []}
          fingerprint={edge.data?.snapshot_fingerprint}
          gated={gated}
        />

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
    </div>
  )
}
