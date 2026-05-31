import { useRunTrades, flattenTrades } from '@/hooks/useRunTrades'
import type { UUID } from '@/api/types'

interface Props {
  runId: UUID
}

export function TradesTable({ runId }: Props) {
  const query = useRunTrades(runId)
  const trades = flattenTrades(query.data)

  if (query.isLoading) return <div className="p-4">Loading trades…</div>
  if (query.isError) return <div className="p-4 text-destructive">Could not load trades.</div>
  if (trades.length === 0) return <div className="p-4 text-muted-foreground">No trades.</div>

  return (
    <div data-testid="trades-table">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-strong)' }}>
            <th style={{ padding: '6px 8px' }}>Entry</th>
            <th style={{ padding: '6px 8px' }}>Exit</th>
            <th style={{ padding: '6px 8px' }}>Direction</th>
            <th style={{ padding: '6px 8px' }}>Qty</th>
            <th style={{ padding: '6px 8px' }}>Stop</th>
            <th style={{ padding: '6px 8px' }}>Target</th>
            <th style={{ padding: '6px 8px' }}>Exit reason</th>
            <th style={{ padding: '6px 8px' }}>PnL</th>
            <th style={{ padding: '6px 8px' }}>R</th>
          </tr>
        </thead>
        <tbody>
          {trades.map(t => (
            <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 8px' }}>
                <div>{t.entry_at}</div>
                <div className="text-muted-foreground text-xs">@ {t.entry_price}</div>
              </td>
              <td style={{ padding: '6px 8px' }}>
                <div>{t.exit_at}</div>
                <div className="text-muted-foreground text-xs">@ {t.exit_price}</div>
              </td>
              <td style={{ padding: '6px 8px' }}>{t.direction}</td>
              <td style={{ padding: '6px 8px' }}>{t.quantity}</td>
              <td style={{ padding: '6px 8px' }}>{t.stop_price}</td>
              <td style={{ padding: '6px 8px' }}>{t.target_price}</td>
              <td style={{ padding: '6px 8px' }}>{t.exit_reason}</td>
              <td style={{ padding: '6px 8px' }}>{t.pnl}</td>
              <td style={{ padding: '6px 8px' }}>{t.r_multiple}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
