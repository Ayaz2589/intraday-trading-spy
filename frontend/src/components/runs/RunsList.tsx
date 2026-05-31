import { useRuns, flattenRuns } from '@/hooks/useRuns'
import { HelpTooltip } from '@/components/help-tooltip'
import { RunRow } from './RunRow'

interface Props {
  onStartBacktest(): void
}

export function RunsList({ onStartBacktest }: Props) {
  const query = useRuns()
  const runs = flattenRuns(query.data)

  if (query.isLoading) {
    return (
      <div className="p-8" data-testid="runs-list-loading">
        Loading runs…
      </div>
    )
  }

  if (query.isError) {
    return (
      <div className="p-8" data-testid="runs-list-error">
        <p className="text-destructive">Could not load runs.</p>
        <button
          type="button"
          onClick={() => query.refetch()}
          className="mt-2 px-3 py-1 border rounded text-sm"
        >
          Try again
        </button>
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <div className="p-8 text-center" data-testid="runs-list-empty">
        <h2 className="text-lg font-semibold mb-2 inline-flex items-center gap-2">
          No runs yet
          <HelpTooltip helpKey="backtest_queue" />
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Start your first backtest to see results here.
        </p>
        <button
          type="button"
          onClick={onStartBacktest}
          className="px-4 py-2 bg-primary text-primary-foreground rounded"
          data-testid="empty-start-backtest"
        >
          Start backtest
        </button>
        <p className="text-xs text-muted-foreground mt-4 inline-flex items-center gap-1">
          Or push CLI runs with <code>--push-to-supabase</code>
          <HelpTooltip helpKey="cloud_push" />
        </p>
      </div>
    )
  }

  return (
    <div data-testid="runs-list">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 120px 120px 120px',
          gap: 12,
          padding: '8px 12px',
          fontSize: 'var(--fs-xs)',
          color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border-strong)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        <span>Started</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          Status
          <HelpTooltip helpKey="backtest_queue" />
        </span>
        <span style={{ textAlign: 'right' }}>Trades</span>
        <span style={{ textAlign: 'right' }}>PnL</span>
      </div>
      {runs.map(run => (
        <RunRow key={run.id} run={run} />
      ))}
      {query.hasNextPage && (
        <div style={{ padding: 12, textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className="px-3 py-1 border rounded text-sm"
          >
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
