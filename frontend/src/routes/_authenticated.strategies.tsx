import { createFileRoute } from '@tanstack/react-router'
import { StrategyList } from '@/components/strategies/StrategyList'

export const Route = createFileRoute('/_authenticated/strategies')({
  component: StrategiesPage,
})

function StrategiesPage() {
  return (
    <div className="p-6">
      <StrategyList />
    </div>
  )
}
