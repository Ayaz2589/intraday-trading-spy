import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useConfigs, useUpdateConfig } from '@/hooks/useConfigs'
import { useStartBacktest } from '@/hooks/useStartBacktest'
import { useStrategies } from '@/hooks/useStrategies'
import type { Config } from '@/api/types'

/** Read a nested key path, defaulting to undefined. */
function get(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj
  for (const k of path) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[k]
  }
  return cur
}

/** Build the nested params object that the backend / config.yaml shape expects. */
function buildParams(knobs: KnobValues, enabledSetup: string): Record<string, unknown> {
  return {
    risk: {
      account_value: knobs.account_value,
      max_risk_per_trade_pct: knobs.max_risk_per_trade_pct,
      max_position_value_pct: knobs.max_position_value_pct,
      max_consecutive_losses: knobs.max_consecutive_losses,
    },
    strategy: {
      enabled_setup: enabledSetup,
      opening_range: { minutes: knobs.opening_range_minutes },
      vwap_pullback: {
        max_distance_from_vwap_pct: knobs.max_distance_from_vwap_pct,
        stop: { buffer_pct: knobs.stop_buffer_pct },
        target: { risk_reward: knobs.risk_reward },
      },
    },
  }
}

interface KnobValues {
  account_value: number
  max_risk_per_trade_pct: number
  max_position_value_pct: number
  max_consecutive_losses: number
  opening_range_minutes: number
  risk_reward: number
  stop_buffer_pct: number
  max_distance_from_vwap_pct: number
}

function knobsFromConfig(config: Config | undefined): KnobValues {
  const p = (config?.params ?? {}) as Record<string, unknown>
  const num = (v: unknown, fallback: number) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
    return Number.isFinite(n) ? n : fallback
  }
  return {
    account_value: num(get(p, ['risk', 'account_value']), 25000),
    max_risk_per_trade_pct: num(get(p, ['risk', 'max_risk_per_trade_pct']), 0.1),
    max_position_value_pct: num(get(p, ['risk', 'max_position_value_pct']), 100),
    max_consecutive_losses: num(get(p, ['risk', 'max_consecutive_losses']), 2),
    opening_range_minutes: num(get(p, ['strategy', 'opening_range', 'minutes']), 15),
    risk_reward: num(get(p, ['strategy', 'vwap_pullback', 'target', 'risk_reward']), 2.0),
    stop_buffer_pct: num(get(p, ['strategy', 'vwap_pullback', 'stop', 'buffer_pct']), 0.05),
    max_distance_from_vwap_pct: num(
      get(p, ['strategy', 'vwap_pullback', 'max_distance_from_vwap_pct']),
      0.25,
    ),
  }
}

export function StrategyConfigDropdown() {
  const configsQuery = useConfigs()
  const strategiesQuery = useStrategies()
  const update = useUpdateConfig()
  const startBacktest = useStartBacktest()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)

  const configs = configsQuery.data?.configs ?? []
  const strategies = strategiesQuery.data ?? []
  // For v1 we always edit the "default" config (the seeded one).
  const config = useMemo(
    () => configs.find(c => c.name === 'default') ?? configs[0],
    [configs],
  )
  const initialKnobs = useMemo(() => knobsFromConfig(config), [config])
  const initialStrategyId = config?.strategy_id ?? strategies[0]?.key ?? ''

  const [knobs, setKnobs] = useState<KnobValues>(initialKnobs)
  const [strategyId, setStrategyId] = useState(initialStrategyId)
  const [saved, setSaved] = useState(false)

  // Re-sync local state when the config arrives / changes.
  useEffect(() => {
    setKnobs(initialKnobs)
  }, [initialKnobs])
  useEffect(() => {
    setStrategyId(initialStrategyId)
  }, [initialStrategyId])

  const enabledSetup =
    (get(config?.params, ['strategy', 'enabled_setup']) as string | undefined) ??
    strategies[0]?.key ??
    'vwap_pullback_long'
  const isVwap = enabledSetup.startsWith('vwap')
  const displayName = strategies.find(s => s.key === enabledSetup)?.display_name ?? enabledSetup

  const onChange = <K extends keyof KnobValues>(key: K, value: number) =>
    setKnobs(prev => ({ ...prev, [key]: value }))

  const onSave = () => {
    if (!config) return
    setSaved(false)
    update.mutate(
      { id: config.id, params: buildParams(knobs, enabledSetup) },
      {
        onSuccess: () => {
          setSaved(true)
          setTimeout(() => setSaved(false), 1500)
        },
      },
    )
  }

  const onSaveAndRun = async () => {
    if (!config) return
    setSaved(false)
    setRunError(null)
    try {
      await update.mutateAsync({ id: config.id, params: buildParams(knobs, enabledSetup) })
      const response = await startBacktest.mutateAsync({ config_name: config.name })
      setOpen(false)
      navigate({ to: '/runs/$runId', params: { runId: response.run_id } })
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="strategy-dropdown-trigger"
          className="text-xs"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 'var(--r-pill, 999px)',
            border: '1px solid var(--border)',
            background: 'var(--surface-2)',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>Strategy</span>
          <span style={{ fontWeight: 600 }}>{displayName}</span>
          <span aria-hidden style={{ color: 'var(--text-muted)' }}>
            ▾
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        style={{
          width: 360,
          padding: 16,
          background: 'var(--surface)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--r-md)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 'var(--fs-sm)', fontWeight: 700 }}>
          Strategy & risk config
        </h3>
        <p
          style={{
            margin: '2px 0 12px',
            fontSize: 'var(--fs-xs)',
            color: 'var(--text-muted)',
          }}
        >
          Edits the <code className="mono">default</code> config. Next backtest uses these values.
        </p>

        <Label>Strategy</Label>
        <select
          value={enabledSetup}
          onChange={() => {
            // Strategy picker is a placeholder until multiple strategies exist —
            // there's only `vwap_pullback_long` in the registry today.
          }}
          disabled
          data-testid="strategy-dropdown-strategy"
          style={selectStyle}
        >
          {strategies.length === 0 ? (
            <option>Loading…</option>
          ) : (
            strategies.map(s => (
              <option key={s.key} value={s.key}>
                {s.display_name}
              </option>
            ))
          )}
        </select>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          <NumberField
            label="Account ($)"
            value={knobs.account_value}
            step={1000}
            onChange={v => onChange('account_value', v)}
          />
          <NumberField
            label="Risk / trade (%)"
            value={knobs.max_risk_per_trade_pct}
            step={0.05}
            onChange={v => onChange('max_risk_per_trade_pct', v)}
          />
          <NumberField
            label="Position cap (%)"
            value={knobs.max_position_value_pct}
            step={10}
            onChange={v => onChange('max_position_value_pct', v)}
          />
          <NumberField
            label="Max consec. losses"
            value={knobs.max_consecutive_losses}
            step={1}
            onChange={v => onChange('max_consecutive_losses', v)}
          />
          <NumberField
            label="Opening range (min)"
            value={knobs.opening_range_minutes}
            step={5}
            onChange={v => onChange('opening_range_minutes', v)}
          />
          <NumberField
            label="Risk : reward"
            value={knobs.risk_reward}
            step={0.25}
            onChange={v => onChange('risk_reward', v)}
          />
          <NumberField
            label="Stop buffer (%)"
            value={knobs.stop_buffer_pct}
            step={0.01}
            onChange={v => onChange('stop_buffer_pct', v)}
          />
          {isVwap && (
            <NumberField
              label="Max dist VWAP (%)"
              value={knobs.max_distance_from_vwap_pct}
              step={0.05}
              onChange={v => onChange('max_distance_from_vwap_pct', v)}
            />
          )}
        </div>

        {(update.isError || runError) && (
          <p style={{ color: 'var(--danger, #dc2626)', fontSize: 'var(--fs-xs)', marginTop: 8 }}>
            {runError ?? (update.error as Error)?.message ?? 'Update failed'}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {saved && (
            <span style={{ color: 'var(--success, #16a34a)', fontSize: 'var(--fs-xs)' }}>
              Saved
            </span>
          )}
          <button
            type="button"
            onClick={() => setKnobs(initialKnobs)}
            className="text-xs"
            style={{
              padding: '6px 10px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={update.isPending || startBacktest.isPending || !config}
            data-testid="strategy-dropdown-save"
            className="text-xs"
            style={{
              marginLeft: 'auto',
              padding: '6px 10px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)',
              background: 'var(--surface-2)',
              color: 'var(--text)',
              cursor: update.isPending ? 'wait' : 'pointer',
              opacity: update.isPending || startBacktest.isPending || !config ? 0.6 : 1,
            }}
          >
            {update.isPending && !startBacktest.isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onSaveAndRun}
            disabled={update.isPending || startBacktest.isPending || !config}
            data-testid="strategy-dropdown-run"
            className="text-xs"
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: 'var(--r-sm)',
              background: 'var(--accent, #2563eb)',
              color: 'white',
              fontWeight: 600,
              cursor: startBacktest.isPending ? 'wait' : 'pointer',
              opacity: update.isPending || startBacktest.isPending || !config ? 0.6 : 1,
            }}
          >
            {startBacktest.isPending
              ? 'Starting…'
              : update.isPending
              ? 'Saving…'
              : 'Run backtest'}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  background: 'var(--surface-2)',
  color: 'var(--text)',
  fontSize: 'var(--fs-xs)',
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: 'block',
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
}: {
  label: string
  value: number
  step: number
  onChange(v: number): void
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type="number"
        value={value}
        step={step}
        onChange={e => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
        style={{
          width: '100%',
          padding: '6px 8px',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-sm)',
          background: 'var(--surface-2)',
          color: 'var(--text)',
          fontSize: 'var(--fs-sm)',
          fontFamily: 'var(--mono)',
        }}
      />
    </div>
  )
}
