import { useState } from 'react'
import { useRun } from '@/hooks/useRun'
import { RunSummaryCards } from './RunSummaryCards'
import { TradesTable } from './TradesTable'
import { SignalsTable } from './SignalsTable'
import { JournalTable } from './JournalTable'
import { HelpTooltip } from '@/components/help-tooltip'
import type { UUID } from '@/api/types'

type Tab = 'summary' | 'trades' | 'signals' | 'journal'

interface Props {
  runId: UUID
  defaultTab?: Tab
  onTabChange?(tab: Tab): void
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'trades', label: 'Trades' },
  { id: 'signals', label: 'Signals' },
  { id: 'journal', label: 'Journal' },
]

export function RunDetail({ runId, defaultTab = 'summary', onTabChange }: Props) {
  const [tab, setTab] = useState<Tab>(defaultTab)
  const runQuery = useRun(runId)

  const switchTab = (next: Tab) => {
    setTab(next)
    onTabChange?.(next)
  }

  if (runQuery.isLoading) {
    return (
      <div className="p-8" data-testid="run-detail-loading">
        Loading run…
      </div>
    )
  }

  if (runQuery.isError) {
    return (
      <div className="p-8" data-testid="run-detail-not-found">
        <h2 className="text-lg font-semibold">Run not found</h2>
        <p className="text-sm text-muted-foreground">
          This run doesn't exist or belongs to a different user.
        </p>
      </div>
    )
  }

  const run = runQuery.data
  if (!run) return null

  return (
    <div className="p-6" data-testid="run-detail">
      <header style={{ marginBottom: 16 }}>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          Run {run.id.slice(0, 8)}…
          <span
            data-testid="run-detail-status"
            data-status={run.status}
            className="text-sm font-normal text-muted-foreground"
          >
            ({run.status})
          </span>
          <HelpTooltip helpKey="run_status" />
        </h1>
        <p className="text-xs text-muted-foreground">
          {run.range_start} → {run.range_end} · {run.bar_count} bars
        </p>
      </header>
      <div role="tablist" aria-label="Run sections" style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => switchTab(t.id)}
            data-testid={`run-detail-tab-${t.id}`}
            style={{
              padding: '6px 10px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)',
              background: tab === t.id ? 'var(--surface-2)' : 'transparent',
              cursor: 'pointer',
              fontSize: 'var(--fs-sm)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'summary' && <RunSummaryCards run={run} />}
      {tab === 'trades' && <TradesTable runId={runId} />}
      {tab === 'signals' && <SignalsTable runId={runId} />}
      {tab === 'journal' && <JournalTable runId={runId} />}
    </div>
  )
}
