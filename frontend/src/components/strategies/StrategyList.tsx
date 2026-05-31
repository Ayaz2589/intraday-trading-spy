import { useStrategies } from '@/hooks/useStrategies'
import { HelpTooltip } from '@/components/help-tooltip'
import { StrategyCard } from './StrategyCard'

export function StrategyList() {
  const query = useStrategies()

  if (query.isLoading) return <div className="p-4">Loading strategies…</div>
  if (query.isError) return <div className="p-4 text-destructive">Could not load strategies.</div>

  const strategies = query.data ?? []

  return (
    <div data-testid="strategy-list">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <h2 className="text-lg font-semibold">Strategies</h2>
        <HelpTooltip helpKey="strategy_registry" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {strategies.map(s => (
          <StrategyCard key={s.key} strategy={s} />
        ))}
      </div>
      {strategies.length === 0 && (
        <div className="text-sm text-muted-foreground">No enabled strategies.</div>
      )}
    </div>
  )
}
