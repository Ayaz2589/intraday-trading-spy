import { Link } from '@tanstack/react-router'
import { useRuns, flattenRuns } from '@/hooks/useRuns'
import { HelpTooltip } from '@/components/help-tooltip'
import { EmptyState } from '@/components/empty-state'
import { BacktestsIcon } from '@/components/nav-icons'
import { RunRow } from './RunRow'

export function RunsList() {
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
      <div data-testid="runs-list-empty">
        <EmptyState
          icon={<BacktestsIcon />}
          title={
            <>
              No backtests yet <HelpTooltip helpKey="backtest_queue" />
            </>
          }
          text="Runs are born from validation studies — every walk-forward window, sensitivity point, and lockbox evaluation lands here as a drillable run with its full trade ledger."
          action={
            <Link to="/validation" className="btn btn-primary">
              Run a walk-forward study →
            </Link>
          }
          hint={
            <>
              Or push CLI runs with{' '}
              <code className="empty-state-code">--push-to-supabase</code>{' '}
              <HelpTooltip helpKey="cloud_push" />
            </>
          }
        />
      </div>
    )
  }

  return (
    <div data-testid="runs-list">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 170px 120px 120px 120px 40px',
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
          Origin
          <HelpTooltip helpKey="child_run" />
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          Status
          <HelpTooltip helpKey="backtest_queue" />
        </span>
        <span style={{ textAlign: 'right' }}>Trades</span>
        <span style={{ textAlign: 'right' }}>PnL</span>
        <span aria-hidden />
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
