import { useState, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { useActivateConfig, useDeleteConfig, useRenameConfig } from '@/hooks/useConfigs'
import { HelpTooltip } from '@/components/help-tooltip'
import { SectionTitle, cardSection } from '@/components/section-title'
import { ConfigEditor } from './config-editor'
import { inputStyle } from './field'
import { knobChips, knobsFromConfig, offDefaultKeys } from '@/lib/config-knobs'
import type { Config } from '@/api/types'

// "Configs" section of the strategy page (2026-06-05 redesign): single-expand
// accordion rows with knob-summary chips and an inline ConfigEditor. Rename /
// delete-confirm / last-config gating carried over from Feature 012.
export function ConfigsSection({
  configs,
  expandedId,
  onToggle,
}: {
  configs: Config[]
  expandedId: string | null
  onToggle(id: string): void
}) {
  const activate = useActivateConfig()
  const rename = useRenameConfig()
  const del = useDeleteConfig()

  return (
    <section data-testid="config-list" style={cardSection}>
      <SectionTitle
        title="Configs"
        subtitle={`${configs.length} config${configs.length === 1 ? '' : 's'} · click one to edit its knobs`}
      >
        <HelpTooltip helpKey="saved_config" />
        <HelpTooltip helpKey="active_config" />
      </SectionTitle>
      <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 8 }}>
        {configs.map(c => (
          <ConfigRow
            key={c.id}
            config={c}
            expanded={c.id === expandedId}
            canDelete={configs.length > 1}
            onToggle={() => onToggle(c.id)}
            onActivate={() => activate.mutate(c.id)}
            onRename={name => rename.mutate({ id: c.id, name })}
            onDelete={() => del.mutate(c.id)}
            renameError={(rename.error as Error | null)?.message}
            deleteError={(del.error as Error | null)?.message}
          />
        ))}
      </ul>
    </section>
  )
}

const summaryChip: CSSProperties = {
  background: 'var(--surface-2)',
  color: 'var(--text-muted)',
}

function ConfigRow({
  config,
  expanded,
  canDelete,
  onToggle,
  onActivate,
  onRename,
  onDelete,
  renameError,
  deleteError,
}: {
  config: Config
  expanded: boolean
  canDelete: boolean
  onToggle(): void
  onActivate(): void
  onRename(name: string): void
  onDelete(): void
  renameError?: string
  deleteError?: string
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(config.name)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Re-sync when the configs query refetches after a successful rename — the
  // row is keyed by stable id, so no remount happens.
  useEffect(() => setName(config.name), [config.name])

  const knobs = knobsFromConfig(config)
  const chips = knobChips(knobs)
  const offCount = offDefaultKeys(knobs).length

  return (
    <li
      className="card"
      data-testid={`config-row-${config.name}`}
      style={{
        padding: 0,
        overflow: 'hidden',
        border: expanded ? '1px solid var(--accent, #2563eb)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 12px' }}>
        {renaming ? (
          <>
            <input
              aria-label={`rename ${config.name}`}
              value={name}
              onChange={e => setName(e.target.value)}
              style={inputStyle}
            />
            <button
              type="button"
              className="btn"
              onClick={() => {
                const trimmed = name.trim()
                if (trimmed && trimmed !== config.name) onRename(trimmed)
                setRenaming(false)
              }}
            >
              Save name
            </button>
            <button type="button" className="btn" onClick={() => { setName(config.name); setRenaming(false) }}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              aria-label={`toggle ${config.name}`}
              aria-expanded={expanded}
              onClick={onToggle}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                color: 'var(--text)',
                fontWeight: 600,
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-sm)',
              }}
            >
              <span aria-hidden style={{ color: 'var(--text-faint)', fontSize: 10 }}>
                {expanded ? '▾' : '▸'}
              </span>
              {config.name}
            </button>
            {config.is_active && (
              <span data-testid={`active-badge-${config.name}`} className="chip chip-accent">
                ACTIVE
              </span>
            )}
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {chips.map(chip => (
                <span key={chip.label} className="chip" style={summaryChip}>
                  {chip.label}&nbsp;
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>{chip.value}</span>
                </span>
              ))}
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {offCount > 0 && (
                <span data-testid={`off-default-${config.name}`} className="chip chip-accent">
                  {offCount} off default
                </span>
              )}
              {!config.is_active && (
                <button type="button" className="btn" onClick={onActivate}>
                  Set active
                </button>
              )}
              <button type="button" className="btn" onClick={() => setRenaming(true)}>
                Rename
              </button>
              {confirmDelete ? (
                <>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', alignSelf: 'center' }}>
                    Delete? <HelpTooltip helpKey="delete_safe" />
                  </span>
                  <button
                    type="button"
                    className="btn"
                    aria-label={`confirm delete ${config.name}`}
                    onClick={() => { onDelete(); setConfirmDelete(false) }}
                  >
                    Confirm
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                    Keep
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn"
                  disabled={!canDelete}
                  title={canDelete ? undefined : 'Cannot delete your last config'}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </button>
              )}
            </span>
          </>
        )}
        {(renameError || deleteError) && (
          <span style={{ flexBasis: '100%', color: 'var(--loss, #dc2626)', fontSize: 'var(--fs-xs)' }}>
            {renameError ?? deleteError}
          </span>
        )}
      </div>
      {expanded && !renaming && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 12 }}>
          <ConfigEditor key={config.id} config={config} />
        </div>
      )}
    </li>
  )
}
