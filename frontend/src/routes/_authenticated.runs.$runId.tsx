import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { RunDetail } from '@/components/runs/RunDetail'

type SearchParams = { tab?: 'summary' | 'trades' | 'signals' | 'journal' }

const VALID_TABS = new Set(['summary', 'trades', 'signals', 'journal'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const Route = createFileRoute('/_authenticated/runs/$runId')({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    tab:
      typeof search.tab === 'string' && VALID_TABS.has(search.tab)
        ? (search.tab as SearchParams['tab'])
        : 'summary',
  }),
  component: RunDetailPage,
})

function RunDetailPage() {
  const { runId } = Route.useParams()
  const { tab } = Route.useSearch()
  const navigate = useNavigate({ from: '/runs/$runId' })

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

  return (
    <RunDetail
      runId={runId}
      defaultTab={tab ?? 'summary'}
      onTabChange={next =>
        navigate({
          search: (prev: SearchParams) => ({ ...prev, tab: next }),
          replace: true,
        })
      }
    />
  )
}
