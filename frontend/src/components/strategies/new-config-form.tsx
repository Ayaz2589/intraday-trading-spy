import { useEffect, useState } from 'react'
import { useCreateConfig, useDuplicateConfig, usePresets } from '@/hooks/useConfigs'
import { HelpTooltip } from '@/components/help-tooltip'
import { SectionTitle, cardSection } from '@/components/section-title'
import { FieldLabel, inputStyle } from './field'
import type { Config, ConfigSource } from '@/api/types'

// "New config" section of the strategy page (2026-06-05 redesign). Creation
// flows (preset / duplicate / scratch) carried over from Feature 012; reports
// the created config id so the workbench can expand its row.
export function NewConfigSection({
  configs,
  activeConfigId,
  onCreated,
}: {
  configs: Config[]
  activeConfigId?: string
  onCreated(id: string): void
}) {
  const presetsQuery = usePresets()
  const create = useCreateConfig()
  const duplicate = useDuplicateConfig()
  const presets = presetsQuery.data?.presets ?? []

  const [source, setSource] = useState<ConfigSource>('preset')
  const [newName, setNewName] = useState('')
  const [presetName, setPresetName] = useState('')
  const [dupFromId, setDupFromId] = useState('')
  const createErr = (create.error as Error | null)?.message

  useEffect(() => {
    if (!presetName && presets[0]) setPresetName(presets[0].name)
  }, [presetName, presets])
  useEffect(() => {
    if (!dupFromId && activeConfigId) setDupFromId(activeConfigId)
  }, [dupFromId, activeConfigId])

  const onCreate = () => {
    const name = newName.trim()
    if (!name) return
    if (source === 'duplicate') {
      duplicate.mutate(
        { id: dupFromId, name },
        { onSuccess: c => onCreated((c as Config).id) },
      )
    } else {
      create.mutate(
        {
          name,
          source,
          preset_name: source === 'preset' ? presetName : undefined,
        },
        { onSuccess: c => onCreated((c as Config).id) },
      )
    }
    setNewName('')
  }

  const selectedPreset = presets.find(p => p.name === presetName)

  return (
    <section data-testid="new-config" style={cardSection}>
      <SectionTitle
        title="New config"
        subtitle="A config is a named bundle of strategy + risk knobs — create several to compare A/B, run sensitivity, or freeze a candidate."
      >
        <HelpTooltip helpKey="duplicate_vs_edit" />
      </SectionTitle>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', marginTop: 12 }}>
        <div style={{ flex: '1 1 180px' }}>
          <FieldLabel>Name</FieldLabel>
          <input
            aria-label="new config name"
            value={newName}
            placeholder="e.g. wf-rr4"
            onChange={e => setNewName(e.target.value)}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
        <div>
          <FieldLabel>Source</FieldLabel>
          <select
            aria-label="source"
            value={source}
            onChange={e => setSource(e.target.value as ConfigSource)}
            style={inputStyle}
          >
            <option value="preset">From preset</option>
            <option value="duplicate">Duplicate existing</option>
            <option value="scratch">From scratch</option>
          </select>
        </div>
        {source === 'preset' && presets.length > 0 && (
          <div role="listbox" aria-label="preset" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignSelf: 'flex-end' }}>
            {presets.map(p => (
              <button
                key={p.name}
                type="button"
                role="option"
                aria-selected={p.name === presetName}
                onClick={() => setPresetName(p.name)}
                className={`chip${p.name === presetName ? ' chip-accent' : ''}`}
                style={{ cursor: 'pointer', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 'var(--r-sm)', fontSize: 'var(--fs-xs)', background: p.name === presetName ? 'var(--accent-dim, #eff6ff)' : 'var(--surface-2)' }}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
        {source === 'duplicate' && (
          <div>
            <FieldLabel>Copy from</FieldLabel>
            <select
              aria-label="duplicate from"
              value={dupFromId}
              onChange={e => setDupFromId(e.target.value)}
              style={inputStyle}
            >
              {configs.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!newName.trim() || create.isPending || duplicate.isPending}
          onClick={onCreate}
        >
          + Create config
        </button>
      </div>
      {(createErr || duplicate.isError) && (
        <p style={{ margin: '8px 0 0', color: 'var(--loss, #dc2626)', fontSize: 'var(--fs-xs)' }}>
          {createErr ?? (duplicate.error as Error)?.message}
        </p>
      )}
      {source === 'preset' && selectedPreset && (
        <p
          style={{
            margin: '10px 0 0',
            fontSize: 'var(--fs-xs)',
            color: 'var(--text-muted)',
          }}
        >
          {selectedPreset.description}
        </p>
      )}
    </section>
  )
}
