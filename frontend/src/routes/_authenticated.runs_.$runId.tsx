import { createFileRoute } from '@tanstack/react-router'
import { RunDetail } from '@/components/runs/RunDetail'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const Route = createFileRoute('/_authenticated/runs_/$runId')({
  component: RunDetailPage,
})

function RunDetailPage() {
  const { runId } = Route.useParams()

  if (!UUID_RE.test(runId)) {
    return (
      <div className="p-8" data-testid="run-detail-invalid">
        <h2 className="text-lg font-semibold">Invalid run id</h2>
        <p className="text-sm text-muted-foreground">
          The URL doesn't contain a valid run identifier.
        </p>
      </div>
    )
  }

  return <RunDetail runId={runId} />
}
