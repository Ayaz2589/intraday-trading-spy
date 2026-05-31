import { Card } from '@/components/ui/card'
import type { Strategy } from '@/api/types'

interface Props {
  strategy: Strategy
}

export function StrategyCard({ strategy }: Props) {
  return (
    <Card style={{ padding: 16 }} data-testid={`strategy-card-${strategy.key}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <h3 style={{ fontSize: 'var(--fs-base)', fontWeight: 600, margin: 0 }}>
          {strategy.display_name}
        </h3>
        <span
          style={{
            fontSize: 'var(--fs-xs)',
            background: 'var(--surface-2)',
            padding: '2px 6px',
            borderRadius: 'var(--r-sm)',
          }}
        >
          {strategy.symbol} · {strategy.direction} · {strategy.kind}
        </span>
      </div>
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', margin: 0 }}>
        {strategy.description}
      </p>
    </Card>
  )
}
