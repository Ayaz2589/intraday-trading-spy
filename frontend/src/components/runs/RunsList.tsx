import { Link } from '@tanstack/react-router'
import { useRuns, flattenRuns } from '@/hooks/useRuns'
import { HelpTooltip } from '@/components/help-tooltip'
import { EmptyState } from '@/components/empty-state'
import { BacktestsIcon } from '@/components/nav-icons'
import { RunRow, RUNS_GRID, RUNS_GRID_MIN_WIDTH } from './RunRow'

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

  const finished = runs.filter(r => r.status === 'finished').length
  const failed = runs.filter(r => r.status === 'failed').length
  const trades = runs.reduce((n, r) => n + (r.summary?.total_trades ?? 0), 0)

  return (
    <div data-testid="runs-list">
      {/* Counts cover the LOADED pages (the list is cursor-paginated). */}
      <div data-testid="runs-stats" style={{ display: 'flex', gap: 22, margin: '4px 0 10px' }}>
        {(
          [
            [String(runs.length), 'loaded', 'var(--text)'],
            [String(finished), 'finished', 'var(--profit, #1a7f37)'],
            [String(failed), 'failed', failed > 0 ? 'var(--loss, #b42318)' : 'var(--text-muted)'],
            [trades.toLocaleString(), 'trades', 'var(--text)'],
          ] as Array<[string, string, string]>
        ).map(([value, label, color]) => (
          <span key={label}>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 'var(--fs-lg, 17px)', color }}>
              {value}
            </span>
            <span style={{ display: 'block', fontSize: 'var(--fs-xs, 10px)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {label}
            </span>
          </span>
        ))}
      </div>
      {/* Fixed-width columns + min-width scroll container: alignment holds at
          any viewport instead of the grid squishing out of line. */}
      <div data-testid="runs-scroll" style={{ overflowX: 'auto' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: RUNS_GRID,
          minWidth: RUNS_GRID_MIN_WIDTH,
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
      </div>
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
