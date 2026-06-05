import { useEffect, useMemo, useState } from 'react'
import { useConfigs } from '@/hooks/useConfigs'
import { NewConfigSection } from './new-config-form'
import { ConfigsSection } from './config-list'
import { DraftConfigPanel } from './DraftConfigPanel'
import { decodeDraft } from '@/lib/draft-config'

// Feature 012's config manager, slimmed to a composer by the 2026-06-05
// redesign: NewConfigSection creates, ConfigsSection lists + edits inline.
// This file owns the shared list query and which accordion row is expanded.
// Feature 017 layers a transient Claude-drafted config on top: ?draft=
// (decoded defensively here) renders a DraftConfigPanel above the sections.
export function ConfigWorkbench({
  draftParam,
  onDismissDraft,
}: {
  // Feature 017: raw ?draft= value (decoded defensively here) + dismiss.
  draftParam?: string
  onDismissDraft?: () => void
} = {}) {
  const configsQuery = useConfigs()
  const configs = configsQuery.data?.configs ?? []
  const activeConfig = useMemo(
    () => configs.find(c => c.is_active) ?? configs[0],
    [configs],
  )

  // undefined = not yet initialized (expand the active config once loaded);
  // null = the operator explicitly collapsed the open row.
  const [expandedId, setExpandedId] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (expandedId === undefined && activeConfig) setExpandedId(activeConfig.id)
  }, [expandedId, activeConfig])

  // If the expanded config disappears (deleted), collapse cleanly instead of
  // pointing at a dead id.
  useEffect(() => {
    if (
      typeof expandedId === 'string' &&
      configs.length > 0 &&
      !configs.some(c => c.id === expandedId)
    ) {
      setExpandedId(null)
    }
  }, [configs, expandedId])

  // Feature 017: decode the transient draft (defensive — malformed -> notice).
  const draft = draftParam ? decodeDraft(draftParam) : null

  return (
    <div data-testid="config-manager" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {draftParam && !draft && (
        <p className="stat-label" style={{ color: 'var(--loss)' }}>
          That draft link could not be read — showing the normal configs page.
        </p>
      )}
      {draft && (
        <DraftConfigPanel
          draft={draft}
          configs={configs}
          activeConfig={activeConfig}
          onDismiss={() => onDismissDraft?.()}
        />
      )}
      <NewConfigSection
        configs={configs}
        activeConfigId={activeConfig?.id}
        onCreated={setExpandedId}
      />
      <ConfigsSection
        configs={configs}
        expandedId={expandedId ?? null}
        onToggle={id => setExpandedId(prev => (prev === id ? null : id))}
      />
    </div>
  )
}
