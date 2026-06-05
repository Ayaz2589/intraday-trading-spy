import { useNavigate } from '@tanstack/react-router'
import { useConfigDistribution, useEdgeTimeseries } from '@/hooks/useInsights'
import { EdgeTimeseries } from './EdgeTimeseries'
import { ConfigDistribution } from './ConfigDistribution'

// Feature 016: the Insights page — split Layout A (chosen via visual
// companion): charts column left 2/3, advisory right rail. US3 mounts the
// ClaudeReadCard into the rail; until generated it shows the placeholder.

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
        <EdgeTimeseries
          points={edge.data?.points ?? []}
          onOpenRun={(runId) => navigate({ to: '/runs/$runId', params: { runId } })}
        />
        <ConfigDistribution rows={dist.data?.rows ?? []} />
      </div>

      <div
        data-testid="insights-right-rail"
        style={{ position: 'sticky', top: 12, display: 'grid', gap: 12 }}
      >
        {/* US3: ClaudeReadCard mounts here (insights scope). */}
      </div>
    </div>
  )
}
