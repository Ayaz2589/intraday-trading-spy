import { useEffect, useMemo, useState } from 'react'
import { DraftConfigPanel } from './DraftConfigPanel'
import { decodeDraft } from '@/lib/draft-config'
import {
  useActivateConfig,
  useConfigs,
  useCreateConfig,
  useDeleteConfig,
  useDuplicateConfig,
  useRenameConfig,
  useUpdateConfig,
  usePresets,
} from '@/hooks/useConfigs'
import { HelpTooltip } from '@/components/help-tooltip'
import {
  buildParams,
  get,
  knobsFromConfig,
  type KnobValues,
} from '@/lib/config-knobs'
import type { Config, ConfigSource } from '@/api/types'

// Feature 012: the multi-config manager. Lists every saved config, marks the
// active one (pre-selected in every picker), and lets the operator create
// (scratch / preset / duplicate), rename, delete, activate, and edit knobs.
// Past runs keep their own config_snapshot, so deleting is safe for history.
export function ConfigManager({
  draftParam,
  onDismissDraft,
}: {
  // Feature 017: raw ?draft= value (decoded defensively here) + dismiss.
  draftParam?: string
  onDismissDraft?: () => void
} = {}) {
  const configsQuery = useConfigs()
  const presetsQuery = usePresets()
  const create = useCreateConfig()
  const duplicate = useDuplicateConfig()
  const activate = useActivateConfig()
  const rename = useRenameConfig()
  const del = useDeleteConfig()

  const configs = configsQuery.data?.configs ?? []
  const presets = presetsQuery.data?.presets ?? []
  const activeConfig = useMemo(
    () => configs.find(c => c.is_active) ?? configs[0],
    [configs],
  )

  // Which config the knob editor targets. Default to the active one.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  useEffect(() => {
    if (!selectedId && activeConfig) setSelectedId(activeConfig.id)
  }, [selectedId, activeConfig])
  const selected = configs.find(c => c.id === selectedId) ?? activeConfig

  // ---- create form ----
  const [source, setSource] = useState<ConfigSource>('preset')
  const [newName, setNewName] = useState('')
  const [presetName, setPresetName] = useState('')
  const [dupFromId, setDupFromId] = useState('')
  const createErr = (create.error as Error | null)?.message

  useEffect(() => {
    if (!presetName && presets[0]) setPresetName(presets[0].name)
  }, [presetName, presets])
  useEffect(() => {
    if (!dupFromId && activeConfig) setDupFromId(activeConfig.id)
  }, [dupFromId, activeConfig])

  const onCreate = () => {
    const name = newName.trim()
    if (!name) return
    if (source === 'duplicate') {
      duplicate.mutate(
        { id: dupFromId, name },
        { onSuccess: c => setSelectedId((c as Config).id) },
      )
    } else {
      create.mutate(
        {
          name,
          source,
          preset_name: source === 'preset' ? presetName : undefined,
        },
        { onSuccess: c => setSelectedId((c as Config).id) },
      )
    }
    setNewName('')
  }

  // Feature 017: decode the transient draft (defensive — malformed -> notice).
  const draft = draftParam ? decodeDraft(draftParam) : null

  return (
    <section data-testid="config-manager">
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <h2 className="text-lg font-semibold">Configs</h2>
        <HelpTooltip helpKey="saved_config" />
        <HelpTooltip helpKey="active_config" />
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
        A config is a named bundle of strategy + risk knobs. Create more than one
        to compare them — walk-forward A vs. B, sensitivity over a base, or freeze
        a candidate for the lockbox.
      </p>

      {/* Create */}
      <div
        className="card"
        style={{ padding: 12, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}
      >
        <div>
          <FieldLabel>
            New config <HelpTooltip helpKey="duplicate_vs_edit" />
          </FieldLabel>
          <input
            aria-label="new config name"
            value={newName}
            placeholder="name"
            onChange={e => setNewName(e.target.value)}
            style={inputStyle}
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
        {source === 'preset' && (
          <div>
            <FieldLabel>Preset</FieldLabel>
            <select
              aria-label="preset"
              value={presetName}
              onChange={e => setPresetName(e.target.value)}
              style={inputStyle}
            >
              {presets.map(p => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
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
          Create
        </button>
        {(createErr || duplicate.isError) && (
          <span style={{ color: 'var(--loss, #dc2626)', fontSize: 'var(--fs-xs)' }}>
            {createErr ?? (duplicate.error as Error)?.message}
          </span>
        )}
        {source === 'preset' && presetName && (
          <p style={{ flexBasis: '100%', margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
            {presets.find(p => p.name === presetName)?.description}
          </p>
        )}
      </div>

      {/* List */}
      <ul data-testid="config-list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {configs.map(c => (
          <ConfigRow
            key={c.id}
            config={c}
            isSelected={c.id === selectedId}
            canDelete={configs.length > 1}
            onSelect={() => setSelectedId(c.id)}
            onActivate={() => activate.mutate(c.id)}
            onRename={name => rename.mutate({ id: c.id, name })}
            onDelete={() => del.mutate(c.id)}
            renameError={(rename.error as Error | null)?.message}
            deleteError={(del.error as Error | null)?.message}
          />
        ))}
      </ul>

      {/* Editor */}
      {selected && <ConfigEditor key={selected.id} config={selected} />}
    </section>
  )
}

function ConfigRow({
  config,
  isSelected,
  canDelete,
  onSelect,
  onActivate,
  onRename,
  onDelete,
  renameError,
  deleteError,
}: {
  config: Config
  isSelected: boolean
  canDelete: boolean
  onSelect(): void
  onActivate(): void
  onRename(name: string): void
  onDelete(): void
  renameError?: string
  deleteError?: string
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(config.name)
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <li
      className="card"
      style={{
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        border: isSelected ? '1px solid var(--accent, #2563eb)' : undefined,
      }}
    >
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
            onClick={onSelect}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, color: 'var(--text)' }}
          >
            {config.name}
          </button>
          {config.is_active ? (
            <span
              data-testid={`active-badge-${config.name}`}
              style={{
                fontSize: 'var(--fs-xs)',
                padding: '1px 8px',
                borderRadius: 'var(--r-pill, 999px)',
                background: 'var(--accent, #2563eb)',
                color: 'white',
              }}
            >
              active
            </span>
          ) : (
            <button type="button" className="btn" onClick={onActivate}>
              Set active
            </button>
          )}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
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
    </li>
  )
}

function ConfigEditor({ config }: { config: Config }) {
  const update = useUpdateConfig()
  const initial = useMemo(() => knobsFromConfig(config), [config])
  const [knobs, setKnobs] = useState<KnobValues>(initial)
  const [saved, setSaved] = useState(false)
  useEffect(() => setKnobs(initial), [initial])

  const enabledSetup =
    (get(config.params, ['strategy', 'enabled_setup']) as string | undefined) ??
    'vwap_pullback_long'

  const onChange = <K extends keyof KnobValues>(key: K, value: number) =>
    setKnobs(prev => ({ ...prev, [key]: value }))

  const onSave = () => {
    setSaved(false)
    update.mutate(
      { id: config.id, params: buildParams(knobs, enabledSetup) },
      { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 1500) } },
    )
  }

  return (
    <div className="card" style={{ padding: 12, marginTop: 16 }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 'var(--fs-sm)', fontWeight: 700 }}>
        Edit <code className="mono">{config.name}</code>
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        <NumberField label="Account ($)" value={knobs.account_value} step={1000} onChange={v => onChange('account_value', v)} />
        <NumberField label="Risk / trade (%)" value={knobs.max_risk_per_trade_pct} step={0.05} onChange={v => onChange('max_risk_per_trade_pct', v)} />
        <NumberField
          label="Position cap (%)"
          help="position_cap"
          help2="buying_power"
          value={knobs.max_position_value_pct}
          step={50}
          onChange={v => onChange('max_position_value_pct', v)}
        />
        <NumberField label="Max consec. losses" value={knobs.max_consecutive_losses} step={1} onChange={v => onChange('max_consecutive_losses', v)} />
        <NumberField label="Opening range (min)" value={knobs.opening_range_minutes} step={5} onChange={v => onChange('opening_range_minutes', v)} />
        <NumberField label="Risk : reward" value={knobs.risk_reward} step={0.25} onChange={v => onChange('risk_reward', v)} />
        <NumberField label="Stop buffer (%)" value={knobs.stop_buffer_pct} step={0.01} onChange={v => onChange('stop_buffer_pct', v)} />
        <NumberField label="Max dist VWAP (%)" value={knobs.max_distance_from_vwap_pct} step={0.05} onChange={v => onChange('max_distance_from_vwap_pct', v)} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        {saved && <span style={{ color: 'var(--success, #16a34a)', fontSize: 'var(--fs-xs)' }}>Saved</span>}
        <button type="button" className="btn" onClick={() => setKnobs(initial)}>Reset</button>
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginLeft: 'auto' }}
          aria-label={`save ${config.name}`}
          disabled={update.isPending}
          onClick={onSave}
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
      {update.isError && (
        <p style={{ color: 'var(--loss, #dc2626)', fontSize: 'var(--fs-xs)', marginTop: 8 }}>
          {(update.error as Error).message}
        </p>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '6px 8px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  background: 'var(--surface-2)',
  color: 'var(--text)',
  fontSize: 'var(--fs-xs)',
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 'var(--fs-xs)',
        color: 'var(--text-muted)',
        marginBottom: 2,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {children}
    </label>
  )
}

function NumberField({
  label,
  value,
  step,
  onChange,
  help,
  help2,
}: {
  label: string
  value: number
  step: number
  onChange(v: number): void
  help?: import('@/components/help-content').HelpContentKey
  help2?: import('@/components/help-content').HelpContentKey
}) {
  return (
    <div>
      <FieldLabel>
        {label}
        {help && <HelpTooltip helpKey={help} />}
        {help2 && <HelpTooltip helpKey={help2} />}
      </FieldLabel>
      <input
        type="number"
        aria-label={label}
        value={value}
        step={step}
        onChange={e => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
        style={{ ...inputStyle, width: '100%', fontFamily: 'var(--mono)', fontSize: 'var(--fs-sm)' }}
      />
    </div>
  )
}
