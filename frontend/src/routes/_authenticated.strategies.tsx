import { createFileRoute } from '@tanstack/react-router'
import { StrategyList } from '@/components/strategies/StrategyList'
import { ConfigManager } from '@/components/strategies/config-manager'

// Feature 017: ?draft= carries a transient Claude-drafted config (base64url
// JSON, decoded defensively downstream). Never persisted — dismissing simply
// clears the param (sign-in `next` param precedent).
export const Route = createFileRoute('/_authenticated/strategies')({
  validateSearch: (search: Record<string, unknown>): { draft?: string } => ({
    draft: typeof search.draft === 'string' ? search.draft : undefined,
  }),
  component: StrategiesPage,
})

function StrategiesPage() {
  const { draft } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <div className="p-6" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <StrategyList />
      <ConfigManager
        draftParam={draft}
        onDismissDraft={() => navigate({ search: {}, replace: true })}
      />
    </div>
  )
}
