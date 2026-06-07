import { HelpTooltip } from '../help-tooltip'
import { Pager, usePager } from '@/components/pager'
import type { ConfigDistributionRow } from '@/api/types'

// Feature 016 (US2): per-config distribution of per-window OOS outcomes —
// the A/B comparison view the config system was built for.
//
// 016-polish: account size (explains why $ columns differ wildly across
// configs), win rate, profit factor, window-R quartiles (the cross-config
// comparable), and each config's latest pooled-gate verdict chip.
//
// Handoff redesign: design-system table (overline headers, mono numerics,
// everything left-aligned), gate verdicts as badge pills, and a
// positive-windows meter per config (the job-table window-progress pattern).

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
      className={`badge badge-xs ${passed ? 'badge-profit' : 'badge-loss'}`}
      style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
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
  const pager = usePager(rows, 10)
  return (
    <section className="card" data-testid="config-distribution">
      <header className="card-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <h3 className="card-title">
            <span className="card-accent" style={{ background: 'var(--info)' }} />
            Per-config window distribution <HelpTooltip helpKey="window_distribution" />
          </h3>
          <span className="card-sub">
            Per-window OOS outcomes by config — window-R quartiles are the
            cross-config comparable
          </span>
        </div>
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
              {pager.pageItems.map((r) => (
                <tr key={r.config_name ?? '?'} data-testid={`dist-row-${r.config_name ?? 'unknown'}`}>
                  <td style={{ fontWeight: 600 }}>{r.config_name ?? '(unknown)'}</td>
                  <td className="mono" style={{ color: 'var(--text-muted)' }}>
                    {usd(r.account_value)}
                  </td>
                  <td className="mono">
                    <div className="win-cell">
                      <span>
                        {r.windows_positive} / {r.windows}
                      </span>
                      <div className="win-bar" data-testid="win-meter">
                        <span
                          className="win-fill"
                          style={{
                            width: `${r.windows > 0 ? Math.round((r.windows_positive / r.windows) * 100) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
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
          <Pager page={pager.page} pageCount={pager.pageCount} onPage={pager.setPage} />
        </div>
      )}
    </section>
  )
}
