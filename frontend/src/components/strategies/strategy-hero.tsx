import type { CSSProperties, ReactNode } from 'react'
import { useStrategies } from '@/hooks/useStrategies'
import { HelpTooltip } from '@/components/help-tooltip'
import { STRATEGY_EXPLAINERS } from './strategy-explainers'
import type { Strategy } from '@/api/types'

// Mockup-driven hero card for each enabled strategy (2026-06-05 redesign):
// identity row + registry chips + "active strategy" badge, description, and
// an Entry / Stop / Target explainer grid with colored rails.
export function StrategyHero() {
  const query = useStrategies()

  if (query.isLoading) return <div className="p-4">Loading strategies…</div>
  if (query.isError) return <div className="p-4 text-destructive">Could not load strategies.</div>

  const strategies = query.data ?? []

  return (
    <div data-testid="strategy-hero" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {strategies.map(s => (
        <StrategyHeroCard key={s.key} strategy={s} />
      ))}
      {strategies.length === 0 && (
        <div className="text-sm text-muted-foreground">No enabled strategies.</div>
      )}
    </div>
  )
}

const registryChip: CSSProperties = {
  background: 'var(--surface-2)',
  color: 'var(--text-muted)',
  fontFamily: 'var(--mono)',
}

function StrategyHeroCard({ strategy }: { strategy: Strategy }) {
  const explainer = STRATEGY_EXPLAINERS[strategy.key]
  return (
    <section
      className="card"
      data-testid={`strategy-card-${strategy.key}`}
      style={{ padding: '16px 18px' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span
          aria-hidden
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 34,
            height: 34,
            borderRadius: 'var(--r-sm)',
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
            fontSize: 'var(--fs-md)',
            flexShrink: 0,
          }}
        >
          ◎
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 'var(--fs-md)', fontWeight: 700 }}>
              {strategy.display_name}
            </h2>
            <HelpTooltip helpKey="strategy_registry" />
            <span className="chip" style={registryChip}>{strategy.symbol}</span>
            <span className="chip" style={registryChip}>{strategy.direction}</span>
            <span className="chip" style={registryChip}>{strategy.kind}</span>
            <span className="chip chip-profit" style={{ marginLeft: 'auto' }}>
              <span aria-hidden>● </span>active strategy
            </span>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', maxWidth: 720 }}>
            {strategy.description}
          </p>
        </div>
      </div>
      {explainer && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 10,
            marginTop: 14,
          }}
        >
          <ExplainerCard title="Entry" color="var(--accent)" body={explainer.entry} />
          <ExplainerCard title="Stop" color="var(--loss)" body={explainer.stop} />
          <ExplainerCard title="Target" color="var(--profit)" body={explainer.target} />
        </div>
      )}
    </section>
  )
}

function ExplainerCard({ title, color, body }: { title: string; color: string; body: ReactNode }) {
  return (
    <div
      style={{
        borderLeft: `2px solid ${color}`,
        background: 'var(--surface-2)',
        borderRadius: 'var(--r-sm)',
        padding: '10px 12px',
      }}
    >
      <div className="stat-label" style={{ color, marginBottom: 4 }}>{title}</div>
      <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
        {body}
      </p>
    </div>
  )
}
