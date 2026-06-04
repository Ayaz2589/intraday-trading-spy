import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { subscribe, getSnapshot } from '@/lib/strategy-menu-controller'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarField } from '@/components/calendar-field'
import { clampEnd, maxEndForStart, minIso, MAX_RANGE_DAYS } from '@/lib/date-range'
import { useBarsCoverage } from '@/hooks/useBarsCoverage'
import { useActivateConfig, useConfigs, useUpdateConfig } from '@/hooks/useConfigs'
import { useStartBacktest } from '@/hooks/useStartBacktest'
import { useStrategies } from '@/hooks/useStrategies'
import { buildParams, get, knobsFromConfig, type KnobValues } from '@/lib/config-knobs'

function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function todayIso(): string {
  return toIso(new Date())
}

// yfinance only serves intraday 5m bars for the last ~60 days, but our
// shared bars cache can extend the reachable window: any date we've
// archived in the past stays usable forever. The picker's min becomes
// the older of (today - 60d) and the earliest cached bar.
const MAX_LOOKBACK_DAYS = 60
function yfinanceFloorIso(): string {
  const d = new Date()
  d.setDate(d.getDate() - MAX_LOOKBACK_DAYS)
  return toIso(d)
}
function minPickable(earliestCached: string | null | undefined): string {
  const floor = yfinanceFloorIso()
  if (!earliestCached) return floor
  return earliestCached < floor ? earliestCached : floor
}

/** Monday → Friday of the calendar week containing today, end clamped to today. */
function currentWeekRange(): { start: string; end: string } {
  const now = new Date()
  const dow = now.getDay() // 0 Sun .. 6 Sat
  // Days back to Monday (Sun-rolled to previous Mon).
  const daysBack = dow === 0 ? 6 : dow - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - daysBack)
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)
  const end = friday < now ? friday : now
  return { start: toIso(monday), end: toIso(end) }
}

export function StrategyConfigDropdown() {
  const configsQuery = useConfigs()
  const strategiesQuery = useStrategies()
  const coverageQuery = useBarsCoverage()
  const update = useUpdateConfig()
  const activate = useActivateConfig()
  const startBacktest = useStartBacktest()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)

  // Let other surfaces (e.g. the runs empty-state CTA) request that this
  // launcher open. Each request bumps the snapshot counter; open on bump.
  const openRequest = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  useEffect(() => {
    if (openRequest > 0) setOpen(true)
  }, [openRequest])

  const initialRange = useMemo(() => currentWeekRange(), [])
  const [rangeStart, setRangeStart] = useState(initialRange.start)
  const [rangeEnd, setRangeEnd] = useState(initialRange.end)

  const configs = configsQuery.data?.configs ?? []
  const strategies = strategiesQuery.data ?? []
  // Feature 012: edit & run whichever config is ACTIVE (pre-selected). The
  // picker below switches the active config server-side. Fall back to the
  // seeded `default`, then the first config, before the list/flag loads.
  const config = useMemo(
    () =>
      configs.find(c => c.is_active) ??
      configs.find(c => c.name === 'default') ??
      configs[0],
    [configs],
  )
  const initialKnobs = useMemo(() => knobsFromConfig(config), [config])

  const [knobs, setKnobs] = useState<KnobValues>(initialKnobs)
  const [saved, setSaved] = useState(false)

  // Re-sync local state when the config arrives / changes.
  useEffect(() => {
    setKnobs(initialKnobs)
  }, [initialKnobs])

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
      const response = await startBacktest.mutateAsync({
        config_name: config.name,
        start_date: rangeStart,
        end_date: rangeEnd,
      })
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
          Edits & runs the active config. Manage configs on the Strategies page.
        </p>

        {configs.length > 1 && (
          <div style={{ marginBottom: 8 }}>
            <Label>Config</Label>
            <select
              aria-label="active config"
              data-testid="strategy-dropdown-config"
              value={config?.id ?? ''}
              disabled={activate.isPending}
              onChange={e => {
                const next = configs.find(c => c.id === e.target.value)
                if (next && !next.is_active) activate.mutate(next.id)
              }}
              style={selectStyle}
            >
              {configs.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.is_active ? ' (active)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

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

        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: '1px solid var(--border)',
          }}
        >
          <Label>Backtest date range</Label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <CalendarField
              value={rangeStart}
              onChange={(s) => {
                setRangeStart(s)
                // Keep the end within the max window when the start moves.
                setRangeEnd((prev) => clampEnd(s, prev))
              }}
              min={minPickable(coverageQuery.data?.earliest)}
              max={todayIso()}
              ariaLabel="Backtest start date"
              testid="backtest-range-start"
            />
            <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>→</span>
            <CalendarField
              value={rangeEnd}
              onChange={setRangeEnd}
              min={rangeStart}
              max={minIso(todayIso(), maxEndForStart(rangeStart))}
              ariaLabel="Backtest end date"
              testid="backtest-range-end"
            />
          </div>
          <p
            style={{
              marginTop: 4,
              fontSize: 'var(--fs-xs)',
              color: 'var(--text-muted)',
            }}
          >
            {coverageQuery.data?.earliest
              ? `Cached history goes back to ${coverageQuery.data.earliest}. yfinance auto-fills the last 60 days on run. Max ${MAX_RANGE_DAYS}-day range.`
              : `yfinance serves 5m intraday data for the last 60 days. Missing days auto-download on run. Max ${MAX_RANGE_DAYS}-day range.`}
          </p>
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
