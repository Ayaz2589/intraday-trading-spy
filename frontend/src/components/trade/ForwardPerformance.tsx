import { LineScatter } from '../charts/line-scatter'
import { HelpTooltip } from '../help-tooltip'
import type { TradePerformance } from '@/api/trade'

// Feature 021 (US3): the forward record — equity over time, per-trade R
// multiples, summary metrics in the SAME vocabulary as backtests, so the
// forward evidence reads against the archive. This data never feeds the
// Insights aggregates (spec Clarification #1).

const r = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`

export function ForwardPerformance({ perf }: { perf: TradePerformance }) {
  const s = perf.summary
  return (
    <div data-testid="forward-performance"
         style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        {([
          [String(s.trades), 'paper trades'],
          [s.win_rate == null ? '—' : `${Math.round(s.win_rate * 100)}%`, 'win rate'],
          [s.expectancy_r == null ? '—' : r(s.expectancy_r), 'expectancy'],
          [r(s.total_r), 'total R'],
          [`$${s.total_gross_pnl.toFixed(2)}`, 'gross P&L'],
        ] as Array<[string, string]>).map(([value, label]) => (
          <span key={label}>
            <span className="mono" style={{ fontWeight: 700, fontSize: 'var(--fs-lg, 17px)' }}>
              {value}
            </span>
            <span style={{ display: 'block', fontSize: 'var(--fs-xs, 10px)',
                           color: 'var(--text-muted)', textTransform: 'uppercase',
                           letterSpacing: 0.5 }}>
              {label}
            </span>
          </span>
        ))}
        <span style={{ marginLeft: 'auto' }}>
          <HelpTooltip helpKey="forward_record" />
        </span>
      </div>

      {perf.trades.length === 0 ? (
        <p className="stat-label" style={{ margin: 0 }}>
          No paper trades yet — start automation and the forward record builds
          itself, one honest trade at a time.
        </p>
      ) : (
        <>
          <LineScatter
            height={180}
            series={[{
              id: 'cumulative P&L',
              color: 'var(--accent)',
              points: perf.equity_curve.map(p => ({
                x: Date.parse(p.t), y: p.cum_pnl,
                label: `$${p.cum_pnl.toFixed(2)}`,
              })),
            }]}
            formatY={(v) => `$${Math.round(v)}`}
            formatX={(v) => new Date(v).toLocaleDateString()}
          />
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>day</th><th>origin</th><th>qty</th><th>entry</th>
                  <th>exit</th><th>exit reason</th><th>R</th><th>P&L</th>
                </tr>
              </thead>
              <tbody>
                {perf.trades.map(t => (
                  <tr key={t.id}>
                    <td className="mono">{t.trading_day}</td>
                    <td>{t.origin}</td>
                    <td className="mono">{t.qty}</td>
                    <td className="mono">{Number(t.entry_price).toFixed(2)}</td>
                    <td className="mono">{Number(t.exit_price).toFixed(2)}</td>
                    <td>{t.exit_reason}</td>
                    <td className="mono" style={{
                      color: t.realized_r < 0 ? 'var(--loss)' : 'var(--profit)',
                    }}>
                      {r(Number(t.realized_r))}
                    </td>
                    <td className="mono" style={{
                      color: t.gross_pnl < 0 ? 'var(--loss)' : 'var(--profit)',
                    }}>
                      ${Number(t.gross_pnl).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
