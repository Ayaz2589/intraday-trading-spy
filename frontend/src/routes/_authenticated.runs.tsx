import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useRuns, flattenRuns } from '@/hooks/useRuns'

export const Route = createFileRoute('/_authenticated/runs')({
  component: RunsLanding,
})

function RunsLanding() {
  const runsQuery = useRuns()
  const runs = flattenRuns(runsQuery.data)

  if (runsQuery.isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground" data-testid="runs-landing-loading">
        Loading runs…
      </div>
    )
  }

  if (runs.length > 0) {
    return <Navigate to="/runs/$runId" params={{ runId: runs[0].id }} replace />
  }

  return (
    <div
      className="p-12"
      data-testid="runs-landing-empty"
      style={{ display: 'grid', placeItems: 'center', textAlign: 'center', minHeight: '60vh' }}
    >
      <div style={{ maxWidth: 480 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 'var(--fs-lg)', fontWeight: 700 }}>
          No backtests yet
        </h2>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>
          Open the <strong>Strategy</strong> dropdown in the top bar to tune knobs and click{' '}
          <strong>Run backtest</strong> to queue your first run.
        </p>
      </div>
    </div>
  )
}
