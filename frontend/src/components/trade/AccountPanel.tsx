import { HelpTooltip } from '../help-tooltip'
import type { HelpContentKey } from '../help-content'
import type { TradeState } from '@/api/trade'

// Feature 021 (US2, FR-016): the broker is the source of truth — this panel
// renders what Alpaca reports, alongside the config sizing value backtests
// use (spec Clarification #2).

const usd = (v: number) =>
  `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function Cell({ label, children, help }: {
  label: string
  children: React.ReactNode
  help?: HelpContentKey
}) {
  return (
    <span>
      <span style={{
        display: 'block', fontSize: 'var(--fs-xs, 10px)',
        color: 'var(--text-muted)', textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}>
        {label} {help && <HelpTooltip helpKey={help} />}
      </span>
      <span className="mono" style={{ fontSize: 'var(--fs-sm, 13px)' }}>{children}</span>
    </span>
  )
}

export function AccountPanel({ state }: { state: TradeState }) {
  const { position, open_orders: orders, today, account } = state
  const stop = orders?.find(o => o.stop_price != null)?.stop_price
  const target = orders?.find(o => o.limit_price != null)?.limit_price

  return (
    <div
      data-testid="account-panel"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 14,
      }}
    >
      {account == null ? (
        <Cell label="Account" help="paper_account">broker unavailable</Cell>
      ) : (
        <>
          <Cell label="Position" help="protective_orders">
            {position == null ? (
              'flat'
            ) : (
              <>
                {position.qty} @ {position.avg_entry.toFixed(2)}
                {' · '}
                <span style={{
                  color: position.unrealized_pnl < 0 ? 'var(--loss)'
                    : position.unrealized_pnl > 0 ? 'var(--profit)' : undefined,
                }}>
                  {usd(position.unrealized_pnl)}
                </span>
              </>
            )}
          </Cell>
          <Cell label="Stop / Target">
            {position == null ? '—'
              : `${stop?.toFixed(2) ?? '—'} / ${target?.toFixed(2) ?? '—'}`}
          </Cell>
          <Cell label="Today" help="forward_record">
            {today.trades} trade{today.trades === 1 ? '' : 's'} ·{' '}
            <span style={{
              color: today.realized_pnl < 0 ? 'var(--loss)'
                : today.realized_pnl > 0 ? 'var(--profit)' : undefined,
            }}>
              {usd(today.realized_pnl)}
            </span>
          </Cell>
          <Cell label="Broker equity" help="paper_account">
            {usd(account.broker_equity)}
          </Cell>
          <Cell label="Sizing account" help="sizing_account_value">
            {usd(account.sizing_account_value)}
          </Cell>
        </>
      )}
    </div>
  )
}
