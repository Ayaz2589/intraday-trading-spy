import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useRuns, flattenRuns } from '@/hooks/useRuns'
import { RunsEmptyState } from '@/components/runs/RunsEmptyState'
import { openStrategyMenu } from '@/lib/strategy-menu-controller'

export const Route = createFileRoute('/_authenticated/runs')({
  component: RunsLanding,
})

function RunsLanding() {
  const runsQuery = useRuns()
  const runs = flattenRuns(runsQuery.data)

  if (runsQuery.isLoading) {
    return (
      <div
        className="p-6 text-sm"
        style={{ color: 'var(--text-muted)' }}
        data-testid="runs-landing-loading"
      >
        Loading runs…
      </div>
    )
  }

  if (runs.length > 0) {
    return <Navigate to="/runs/$runId" params={{ runId: runs[0].id }} replace />
  }

  return <RunsEmptyState onCreateRun={openStrategyMenu} />
}
