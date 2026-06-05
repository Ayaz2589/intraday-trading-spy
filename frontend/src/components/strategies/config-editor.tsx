import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useUpdateConfig } from '@/hooks/useConfigs'
import { HelpTooltip } from '@/components/help-tooltip'
import type { HelpContentKey } from '@/components/help-content'
import { FieldLabel } from './field'
import {
  KNOB_DEFAULTS,
  buildParams,
  get,
  knobsFromConfig,
  type KnobValues,
} from '@/lib/config-knobs'
import type { Config } from '@/api/types'

// Inline knob editor for one config (2026-06-05 redesign): SIZING / SIGNAL
// groups, per-field "default x" hints, changed-from-default highlighting, and
// a Reset-to-defaults / Revert / Save footer.

type FieldDef = {
  key: keyof KnobValues
  label: string
  step: number
  prefix?: string
  suffix?: string
  help?: HelpContentKey
  help2?: HelpContentKey
}

const SIZING_FIELDS: FieldDef[] = [
  { key: 'account_value', label: 'Account', step: 1000, prefix: '$' },
  { key: 'max_risk_per_trade_pct', label: 'Risk / trade', step: 0.05, suffix: '%' },
  { key: 'max_position_value_pct', label: 'Position cap', step: 50, suffix: '%', help: 'position_cap', help2: 'buying_power' },
  { key: 'max_consecutive_losses', label: 'Max consec. losses', step: 1 },
]

const SIGNAL_FIELDS: FieldDef[] = [
  { key: 'opening_range_minutes', label: 'Opening range', step: 5, suffix: 'min' },
  { key: 'risk_reward', label: 'Risk : reward', step: 0.25 },
  { key: 'stop_buffer_pct', label: 'Stop buffer', step: 0.01, suffix: '%' },
  { key: 'max_distance_from_vwap_pct', label: 'Max dist. VWAP', step: 0.05, suffix: '%' },
]

export function ConfigEditor({ config }: { config: Config }) {
  const update = useUpdateConfig()
  const savedKnobs = useMemo(() => knobsFromConfig(config), [config])
  const [knobs, setKnobs] = useState<KnobValues>(savedKnobs)
  const [savedFlash, setSavedFlash] = useState(false)
  useEffect(() => setKnobs(savedKnobs), [savedKnobs])

  const enabledSetup =
    (get(config.params, ['strategy', 'enabled_setup']) as string | undefined) ??
    'vwap_pullback_long'

  const dirtyKeys = (Object.keys(knobs) as (keyof KnobValues)[]).filter(
    k => knobs[k] !== savedKnobs[k],
  )
  const dirty = dirtyKeys.length > 0

  const onChange = <K extends keyof KnobValues>(key: K, value: number) =>
    setKnobs(prev => ({ ...prev, [key]: value }))

  const onSave = () => {
    setSavedFlash(false)
    update.mutate(
      { id: config.id, params: buildParams(knobs, enabledSetup) },
      { onSuccess: () => { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1500) } },
    )
  }

  const status = update.isPending
    ? 'Saving…'
    : savedFlash
      ? 'Saved'
      : dirty
        ? `${dirtyKeys.length} unsaved change${dirtyKeys.length === 1 ? '' : 's'}`
        : 'No changes'

  return (
    <div data-testid={`config-editor-${config.name}`}>
      <h3 style={{ margin: '0 0 12px', fontSize: 'var(--fs-sm)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span aria-hidden style={{ color: 'var(--accent)' }}>✎</span>
        Edit <code className="mono" style={{ color: 'var(--accent)' }}>{config.name}</code>
      </h3>
      <KnobGroup title="Sizing" fields={SIZING_FIELDS} knobs={knobs} onChange={onChange} />
      <KnobGroup title="Signal" fields={SIGNAL_FIELDS} knobs={knobs} onChange={onChange} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-faint)' }}>{status}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button type="button" className="btn" onClick={() => setKnobs({ ...KNOB_DEFAULTS })}>
            <span aria-hidden>↻</span> Reset to defaults
          </button>
          <button type="button" className="btn" disabled={!dirty} onClick={() => setKnobs(savedKnobs)}>
            Revert
          </button>
          <button
            type="button"
            className="btn btn-primary"
            aria-label={`save ${config.name}`}
            disabled={!dirty || update.isPending}
            onClick={onSave}
          >
            Save changes
          </button>
        </span>
      </div>
      {update.isError && (
        <p style={{ color: 'var(--loss, #dc2626)', fontSize: 'var(--fs-xs)', marginTop: 8 }}>
          {(update.error as Error).message}
        </p>
      )}
    </div>
  )
}

function KnobGroup({
  title,
  fields,
  knobs,
  onChange,
}: {
  title: string
  fields: FieldDef[]
  knobs: KnobValues
  onChange(key: keyof KnobValues, value: number): void
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="stat-label" style={{ marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        {fields.map(f => (
          <KnobField key={f.key} def={f} value={knobs[f.key]} onChange={v => onChange(f.key, v)} />
        ))}
      </div>
    </div>
  )
}

function KnobField({
  def,
  value,
  onChange,
}: {
  def: FieldDef
  value: number
  onChange(v: number): void
}) {
  const offDefault = value !== KNOB_DEFAULTS[def.key]
  const inputId = `knob-${def.key}`
  const adornment: CSSProperties = { color: 'var(--text-faint)', fontSize: 'var(--fs-xs)' }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
        <FieldLabel htmlFor={inputId} style={{ margin: 0 }}>
          {def.label}
        </FieldLabel>
        {offDefault && (
          <span
            data-testid={`off-default-${def.key}`}
            aria-hidden
            style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }}
          />
        )}
        {def.help && <HelpTooltip helpKey={def.help} />}
        {def.help2 && <HelpTooltip helpKey={def.help2} />}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 10px',
          border: `1px solid ${offDefault ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 'var(--r-sm)',
          background: 'var(--surface-2)',
        }}
      >
        {def.prefix && <span style={adornment}>{def.prefix}</span>}
        <input
          type="number"
          id={inputId}
          aria-label={def.label}
          value={value}
          step={def.step}
          onChange={e => {
            const n = Number(e.target.value)
            if (Number.isFinite(n)) onChange(n)
          }}
          style={{
            flex: 1,
            minWidth: 0,
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text)',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-sm)',
          }}
        />
        {def.suffix && <span style={adornment}>{def.suffix}</span>}
      </div>
      <div style={{ fontSize: 'var(--fs-2xs)', color: offDefault ? 'var(--accent)' : 'var(--text-faint)', marginTop: 3 }}>
        default {KNOB_DEFAULTS[def.key].toLocaleString('en-US')}{def.suffix ?? ''}
      </div>
    </div>
  )
}
