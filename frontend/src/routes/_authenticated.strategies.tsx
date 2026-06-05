import { createFileRoute } from '@tanstack/react-router'
import { StrategyHero } from '@/components/strategies/strategy-hero'
import { ConfigWorkbench } from '@/components/strategies/config-manager'

export const Route = createFileRoute('/_authenticated/strategies')({
  component: StrategiesPage,
})

export function StrategiesPage() {
  return (
    <div className="p-6" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 700 }}>
          Strategy &amp; configs
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
          Define the strategy logic once, then tune named risk configs to backtest and compare
        </p>
      </header>
      <StrategyHero />
      <ConfigWorkbench />
    </div>
  )
}
