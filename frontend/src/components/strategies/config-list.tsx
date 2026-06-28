import { useState, useEffect } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { useActivateConfig, useDeleteConfig, useRenameConfig } from '@/hooks/useConfigs'
import { HelpTooltip } from '@/components/help-tooltip'
import { SectionTitle, cardSection } from '@/components/section-title'
import { SlideOver } from '@/components/ui/slide-over'
import { ConfigEditor } from './config-editor'
import { ConfigSummary } from './config-summary'
import { inputStyle } from './field'
import { configDiffChips, knobsFromConfig, offDefaultKeys } from '@/lib/config-knobs'
import { ActiveConfigHealthBadge } from '@/components/recommend/HealthBadge'
import type { Config } from '@/api/types'

// "Configs" section of the strategy page (2026-06-27 redesign): a flex-wrapped
// grid of COMPACT config cards instead of full-width accordion rows. Clicking a
// card opens a right-anchored SlideOver holding that config's detail + the
// ConfigEditor and the rename / set-active / delete actions. Rename / delete-
// confirm / last-config gating carried over from Feature 012.
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

  // The active config is the one runs/studies/campaigns use — pin it first;
  // the rest keep the API's name order.
  const ordered = [...configs].sort(
    (a, b) => Number(b.is_active) - Number(a.is_active),
  )
  const selected = configs.find(c => c.id === expandedId) ?? null

  return (
    <section data-testid="config-list" style={cardSection}>
      <SectionTitle
        title="Configs"
        subtitle={`${configs.length} config${configs.length === 1 ? '' : 's'} · click one to edit its knobs`}
      >
        <HelpTooltip helpKey="saved_config" />
        <HelpTooltip helpKey="active_config" />
      </SectionTitle>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          margin: '12px 0 0',
        }}
      >
        {ordered.map(c => (
          <ConfigCard key={c.id} config={c} selected={c.id === expandedId} onOpen={() => onToggle(c.id)} />
        ))}
      </div>

      <SlideOver
        open={!!selected}
        onClose={() => selected && onToggle(selected.id)}
        title={
          selected && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 'var(--fs-md)' }}>
                {selected.name}
              </span>
              {selected.is_active && (
                <span data-testid={`active-badge-${selected.name}`} className="chip chip-accent">
                  ACTIVE
                </span>
              )}
              {selected.is_active && <ActiveConfigHealthBadge configId={selected.id} />}
            </span>
          )
        }
      >
        {selected && (
          <ConfigDetail
            config={selected}
            canDelete={configs.length > 1}
            onActivate={() => activate.mutate(selected.id)}
            onRename={name => rename.mutate({ id: selected.id, name })}
            onDelete={() => del.mutate(selected.id)}
            renameError={(rename.error as Error | null)?.message}
            deleteError={(del.error as Error | null)?.message}
          />
        )}
      </SlideOver>
    </section>
  )
}

const summaryChip: CSSProperties = {
  background: 'var(--surface-2)',
  color: 'var(--text-muted)',
}

// A compact, clickable card. Non-full-width (flex-wraps with its siblings).
// It is a div[role=button] — not a native <button> — so the inner HelpTooltip
// buttons remain valid HTML; those stop propagation so the `?` doesn't open
// the drawer.
function ConfigCard({
  config,
  selected,
  onOpen,
}: {
  config: Config
  selected: boolean
  onOpen(): void
}) {
  const knobs = knobsFromConfig(config)
  const chips = configDiffChips(knobs)
  const offCount = offDefaultKeys(knobs).length

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen()
    }
  }
  const stop = (e: { stopPropagation(): void }) => e.stopPropagation()

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`open ${config.name}`}
      data-testid={`config-card-${config.name}`}
      onClick={onOpen}
      onKeyDown={onKey}
      className="card"
      style={{
        flex: '1 1 260px',
        minWidth: 240,
        maxWidth: 360,
        padding: 12,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        border: selected ? '1px solid var(--accent, #2563eb)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 'var(--fs-md)' }}>
          {config.name}
        </span>
        {config.is_active && (
          <span data-testid={`active-badge-${config.name}`} className="chip chip-accent">
            ACTIVE
          </span>
        )}
        {config.is_active && (
          <span onClick={stop} style={{ display: 'inline-flex' }}>
            <ActiveConfigHealthBadge configId={config.id} />
          </span>
        )}
      </div>

      {/* 017: durable provenance (e.g. drafted from a Claude experiment) */}
      {config.description && (
        <span
          className="stat-label"
          title={config.description}
          style={{
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {config.description}
        </span>
      )}

      {/* 025: auto-derived plain-English summary of what the config does. */}
      {config.summary && (
        <span onClick={stop} style={{ display: 'inline-flex' }}>
          <ConfigSummary summary={config.summary} highlights={config.highlights} help />
        </span>
      )}

      {/* Chip row pinned to the BOTTOM of the card (margin-top: auto) so the
          chips line up across cards of differing content height. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
        {chips.map(chip => (
          <span
            key={chip.label}
            className={chip.diff ? 'chip chip-accent' : 'chip'}
            style={chip.diff ? undefined : summaryChip}
          >
            {chip.label}&nbsp;
            <span style={{ fontFamily: 'var(--mono)', color: chip.diff ? undefined : 'var(--text)' }}>
              {chip.value}
            </span>
          </span>
        ))}
        {offCount > 0 && (
          // "customized" = knobs that differ from the config.yaml baseline (NOT
          // the config named "default") — the HelpTooltip spells that out.
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span
              data-testid={`off-default-${config.name}`}
              className="chip"
              style={{ ...summaryChip, border: '1px solid var(--border)' }}
            >
              {offCount} customized
            </span>
            <span onClick={stop} style={{ display: 'inline-flex' }}>
              <HelpTooltip helpKey="customized_knobs" />
            </span>
          </span>
        )}
      </div>
    </div>
  )
}

// The slide-out body: the config's full detail + editor + actions.
function ConfigDetail({
  config,
  canDelete,
  onActivate,
  onRename,
  onDelete,
  renameError,
  deleteError,
}: {
  config: Config
  canDelete: boolean
  onActivate(): void
  onRename(name: string): void
  onDelete(): void
  renameError?: string
  deleteError?: string
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(config.name)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Re-sync when the configs query refetches after a successful rename.
  useEffect(() => setName(config.name), [config.name])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Actions row */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
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
          </>
        )}
        {(renameError || deleteError) && (
          <span style={{ flexBasis: '100%', color: 'var(--loss, #dc2626)', fontSize: 'var(--fs-xs)' }}>
            {renameError ?? deleteError}
          </span>
        )}
      </div>

      {/* 025 summary (full, with help) */}
      {config.summary && (
        <ConfigSummary summary={config.summary} highlights={config.highlights} help />
      )}

      {/* The knob editor */}
      <ConfigEditor key={config.id} config={config} />
    </div>
  )
}
