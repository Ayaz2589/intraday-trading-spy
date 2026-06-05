import { HelpTooltip } from '../help-tooltip'
import type { ConfigDistributionRow } from '@/api/types'

// Feature 016 (US2): per-config distribution of per-window OOS outcomes —
// the A/B comparison view the config system was built for.

const usd = (v: number | null) => (v == null ? '—' : `$${Math.round(v).toLocaleString()}`)

export function ConfigDistribution({ rows }: { rows: ConfigDistributionRow[] }) {
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
        <table className="data-table">
          <thead>
            <tr>
              <th>config</th>
              <th>windows +</th>
              <th>window PnL q25 / median / q75</th>
              <th>OOS trades</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.config_name ?? '?'} data-testid={`dist-row-${r.config_name ?? 'unknown'}`}>
                <td>{r.config_name ?? '(unknown)'}</td>
                <td className="mono">
                  {r.windows_positive} / {r.windows}
                </td>
                <td className="mono">
                  {usd(r.pnl_q25)} / <strong>{usd(r.pnl_q50)}</strong> / {usd(r.pnl_q75)}
                </td>
                <td className="mono">{r.total_trades.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
