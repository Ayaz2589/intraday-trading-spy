import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { RunsList } from '@/components/runs/RunsList'
import { StartBacktestDialog } from '@/components/runs/StartBacktestDialog'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { HelpTooltip } from '@/components/help-tooltip'
import { useRuns, flattenRuns } from '@/hooks/useRuns'
import { useDeleteAllRuns } from '@/hooks/useDeleteRun'

export const Route = createFileRoute('/_authenticated/runs')({
  component: RunsPage,
})

function RunsPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteAllOpen, setDeleteAllOpen] = useState(false)
  const runsQuery = useRuns()
  const runCount = flattenRuns(runsQuery.data).length
  const deleteAll = useDeleteAllRuns()

  return (
    <div className="p-6">
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h1 className="text-2xl font-semibold">Runs</h1>
          <HelpTooltip helpKey="backtest_queue" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {runCount > 0 && (
            <button
              type="button"
              onClick={() => setDeleteAllOpen(true)}
              className="px-3 py-1 border rounded text-sm"
              data-testid="delete-all-button"
              style={{ color: 'var(--danger, #dc2626)', borderColor: 'var(--danger, #dc2626)' }}
            >
              Delete all
            </button>
          )}
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm"
            data-testid="start-backtest-button"
          >
            Start backtest
          </button>
        </div>
      </header>
      <RunsList onStartBacktest={() => setDialogOpen(true)} />
      <StartBacktestDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      <ConfirmDialog
        open={deleteAllOpen}
        title={`Delete all ${runCount} backtests?`}
        message="This permanently deletes every run and all its trades, signals, and journal events. This cannot be undone."
        confirmLabel={deleteAll.isPending ? 'Deleting…' : 'Delete all'}
        variant="destructive"
        onConfirm={() =>
          deleteAll.mutate(undefined, {
            onSuccess: () => setDeleteAllOpen(false),
          })
        }
        onCancel={() => setDeleteAllOpen(false)}
      />
    </div>
  )
}
