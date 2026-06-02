import { Card } from '@/components/ui/card'
import { formatSignedCurrency } from '@/lib/format'
import type { Run } from '@/api/types'

interface Props {
  run: Run
}

export function RunSummaryCards({ run }: Props) {
  const s = run.summary
  const winRatePct = (s.win_rate * 100).toFixed(1) + '%'
  const pnlNum = Number(s.pnl)
  const pnlColor =
    Number.isFinite(pnlNum) && pnlNum !== 0
      ? pnlNum > 0
        ? 'var(--profit)'
        : 'var(--loss)'
      : undefined
  return (
    <div
      data-testid="run-summary-cards"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}
    >
      <Stat label="PnL" value={formatSignedCurrency(s.pnl)} valueColor={pnlColor} />
      <Stat label="Win rate" value={winRatePct} />
      <Stat label="Sharpe" value={s.sharpe.toFixed(2)} />
      <Stat label="Max drawdown" value={s.max_drawdown} />
      <Stat label="Trades" value={String(s.total_trades)} />
      <Stat label="Signals" value={`${s.total_signals} (${s.rejected_signals} rejected)`} />
    </div>
  )
}

function Stat({
  label,
  value,
  valueColor,
}: {
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <Card style={{ padding: 12 }}>
      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, marginTop: 2, color: valueColor }}>
        {value}
      </div>
    </Card>
  )
}
