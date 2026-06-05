import { createFileRoute } from '@tanstack/react-router'
import { StrategyHero } from '@/components/strategies/strategy-hero'
import { ConfigWorkbench } from '@/components/strategies/config-manager'

// Feature 017: ?draft= carries a transient Claude-drafted config (base64url
// JSON, decoded defensively downstream). Never persisted — dismissing simply
// clears the param (sign-in `next` param precedent).
export const Route = createFileRoute('/_authenticated/strategies')({
  validateSearch: (search: Record<string, unknown>): { draft?: string } => ({
    draft: typeof search.draft === 'string' ? search.draft : undefined,
  }),
  component: StrategiesRoute,
})

// Thin router shim so StrategiesPage stays renderable without a router
// context (the route test mounts it directly).
function StrategiesRoute() {
  const { draft } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <StrategiesPage
      draft={draft}
      onDismissDraft={() => navigate({ search: {}, replace: true })}
    />
  )
}

export function StrategiesPage({
  draft,
  onDismissDraft,
}: {
  draft?: string
  onDismissDraft?: () => void
} = {}) {
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
      <ConfigWorkbench draftParam={draft} onDismissDraft={onDismissDraft} />
    </div>
  )
}
