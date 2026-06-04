import { createFileRoute } from '@tanstack/react-router'
import { StrategyList } from '@/components/strategies/StrategyList'
import { ConfigManager } from '@/components/strategies/config-manager'

export const Route = createFileRoute('/_authenticated/strategies')({
  component: StrategiesPage,
})

function StrategiesPage() {
  return (
    <div className="p-6" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <StrategyList />
      <ConfigManager />
    </div>
  )
}
