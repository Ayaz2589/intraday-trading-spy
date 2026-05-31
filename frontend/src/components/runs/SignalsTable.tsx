import { useState } from 'react'
import { useRunSignals, flattenSignals } from '@/hooks/useRunSignals'
import { HelpTooltip } from '@/components/help-tooltip'
import type { UUID } from '@/api/types'

interface Props {
  runId: UUID
}

export function SignalsTable({ runId }: Props) {
  const [executed, setExecuted] = useState<boolean | undefined>(undefined)
  const query = useRunSignals(runId, { executed })
  const signals = flattenSignals(query.data)

  return (
    <div data-testid="signals-table">
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }} role="tablist" aria-label="Signal filter">
        <Tab label="All" active={executed === undefined} onClick={() => setExecuted(undefined)} />
        <Tab label="Executed" active={executed === true} onClick={() => setExecuted(true)} />
        <Tab
          label={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              Rejected
              <HelpTooltip helpKey="rejected_signal" />
            </span>
          }
          active={executed === false}
          onClick={() => setExecuted(false)}
        />
      </div>
      {query.isLoading && <div className="p-4">Loading signals…</div>}
      {query.isError && <div className="p-4 text-destructive">Could not load signals.</div>}
      {!query.isLoading && signals.length === 0 && (
        <div className="p-4 text-muted-foreground">No signals.</div>
      )}
      {signals.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-strong)' }}>
              <th style={{ padding: '6px 8px' }}>Emitted</th>
              <th style={{ padding: '6px 8px' }}>Entry</th>
              <th style={{ padding: '6px 8px' }}>Stop</th>
              <th style={{ padding: '6px 8px' }}>Target</th>
              <th style={{ padding: '6px 8px' }}>Executed</th>
              <th style={{ padding: '6px 8px' }}>Rejection reason</th>
              <th style={{ padding: '6px 8px' }}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {signals.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px' }}>{s.emitted_at}</td>
                <td style={{ padding: '6px 8px' }}>{s.entry_price}</td>
                <td style={{ padding: '6px 8px' }}>{s.stop_price ?? '—'}</td>
                <td style={{ padding: '6px 8px' }}>{s.target_price ?? '—'}</td>
                <td style={{ padding: '6px 8px' }}>{s.executed ? '✓' : '✗'}</td>
                <td style={{ padding: '6px 8px', color: 'var(--danger)' }}>{s.rejection_reason ?? '—'}</td>
                <td style={{ padding: '6px 8px' }}>{s.reason_text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Tab({
  label,
  active,
  onClick,
}: {
  label: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="px-2 py-1 text-xs"
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-sm)',
        background: active ? 'var(--surface-2)' : 'transparent',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}
