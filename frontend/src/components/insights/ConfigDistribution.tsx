import { HelpTooltip } from '../help-tooltip'
import type { ConfigDistributionRow } from '@/api/types'

// Feature 016 (US2): per-config distribution of per-window OOS outcomes —
// the A/B comparison view the config system was built for.
//
// 016-polish: account size (explains why $ columns differ wildly across
// configs), win rate, profit factor, window-R quartiles (the cross-config
// comparable), and each config's latest pooled-gate verdict chip.

const usd = (v: number | null) => (v == null ? '—' : `$${Math.round(v).toLocaleString()}`)
const f2 = (v: number | null) => (v == null ? '—' : v.toFixed(2))

// Redesign: signed values color like the rest of the app (loss red / profit green).
function Signed({ v, fmt }: { v: number | null; fmt: (v: number | null) => string }) {
  if (v == null) return <>—</>
  const color = v < 0 ? 'var(--loss)' : v > 0 ? 'var(--profit)' : undefined
  return <span style={{ color }}>{fmt(v)}</span>
}

function GateChip({
  row,
  onOpenStudy,
}: {
  row: ConfigDistributionRow
  onOpenStudy?(studyId: string): void
}) {
  if (row.gate_passed == null) {
    return <span className="stat-label">no gate yet</span>
  }
  const passed = row.gate_passed
  return (
    <button
      type="button"
      className="btn"
      style={{
        color: passed ? 'var(--profit)' : 'var(--loss)',
        borderColor: passed ? 'var(--profit)' : 'var(--loss)',
        fontSize: 'var(--fs-xs, 11px)',
        padding: '1px 8px',
      }}
      title={`pooled expectancy CI [${f2(row.gate_ci_low)}, ${f2(row.gate_ci_high)}] — open study`}
      onClick={() => row.gate_study_id && onOpenStudy?.(row.gate_study_id)}
    >
      {passed ? 'PASSED' : 'NOT PASSED'}
    </button>
  )
}

export function ConfigDistribution({
  rows,
  onOpenStudy,
}: {
  rows: ConfigDistributionRow[]
  onOpenStudy?(studyId: string): void
}) {
  return (
    <section className="card" data-testid="config-distribution">
      <header className="card-head">
        <h3 className="card-title">
          <span className="card-accent" style={{ background: 'var(--info)' }} />
          Per-config window distribution <HelpTooltip helpKey="window_distribution" />
        </h3>
      </header>
      {rows.length === 0 ? (
        <p className="stat-label">
          No configs to compare yet — out-of-sample windows from walk-forward
          studies populate this comparison.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>config</th>
                <th>account</th>
                <th>windows +</th>
                <th>win rate</th>
                <th>PF</th>
                <th>window R q25 / med / q75</th>
                <th>window PnL q25 / med / q75</th>
                <th>OOS trades</th>
                <th>
                  gate <HelpTooltip helpKey="pooled_gate" />
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.config_name ?? '?'} data-testid={`dist-row-${r.config_name ?? 'unknown'}`}>
                  <td>{r.config_name ?? '(unknown)'}</td>
                  <td className="mono">{usd(r.account_value)}</td>
                  <td className="mono">
                    {r.windows_positive} / {r.windows}
                  </td>
                  <td className="mono">
                    {r.win_rate == null ? '—' : `${Math.round(r.win_rate * 100)}%`}
                  </td>
                  <td className="mono">{f2(r.profit_factor)}</td>
                  <td className="mono">
                    <Signed v={r.r_q25} fmt={f2} /> /{' '}
                    <strong>
                      <Signed v={r.r_q50} fmt={f2} />
                    </strong>{' '}
                    / <Signed v={r.r_q75} fmt={f2} />
                  </td>
                  <td className="mono">
                    <Signed v={r.pnl_q25} fmt={usd} /> /{' '}
                    <strong>
                      <Signed v={r.pnl_q50} fmt={usd} />
                    </strong>{' '}
                    / <Signed v={r.pnl_q75} fmt={usd} />
                  </td>
                  <td className="mono">{r.total_trades.toLocaleString()}</td>
                  <td>
                    <GateChip row={r} onOpenStudy={onOpenStudy} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
