import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { RunsList } from '@/components/runs/RunsList'
import { StartBacktestDialog } from '@/components/runs/StartBacktestDialog'
import { HelpTooltip } from '@/components/help-tooltip'

export const Route = createFileRoute('/_authenticated/runs')({
  component: RunsPage,
})

function RunsPage() {
  const [dialogOpen, setDialogOpen] = useState(false)

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
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm"
          data-testid="start-backtest-button"
        >
          Start backtest
        </button>
      </header>
      <RunsList onStartBacktest={() => setDialogOpen(true)} />
      <StartBacktestDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  )
}
