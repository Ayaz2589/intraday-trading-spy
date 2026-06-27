import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { subscribe, getSnapshot } from '@/lib/strategy-menu-controller'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useActivateConfig, useConfigs } from '@/hooks/useConfigs'
import { useStrategies } from '@/hooks/useStrategies'
import { get, knobsFromConfig } from '@/lib/config-knobs'
import { ConfigSummary } from '@/components/strategies/config-summary'

// Strategy panel (redesigned): a read-only strategy SELECTOR. Pick which
// named config is active and read what it does — the strategy's description
// plus its knob values as text. Knob EDITING lives on the Strategies page;
// backtests no longer launch from here (studies + re-run are the research
// path; standalone launching returns later).

export function StrategyConfigDropdown() {
  const configsQuery = useConfigs()
  const strategiesQuery = useStrategies()
  const activate = useActivateConfig()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  // Other surfaces can still request this panel open (legacy hook-in).
  const openRequest = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  useEffect(() => {
    if (openRequest > 0) setOpen(true)
  }, [openRequest])

  const configs = configsQuery.data?.configs ?? []
  const strategies = strategiesQuery.data ?? []
  // The ACTIVE config is the one every surface (backtests, studies, lockbox)
  // defaults to (Feature 012); selecting here switches it server-side.
  const config = useMemo(
    () =>
      configs.find(c => c.is_active) ??
      configs.find(c => c.name === 'default') ??
      configs[0],
    [configs],
  )
  const knobs = useMemo(() => knobsFromConfig(config), [config])

  const enabledSetup =
    (get(config?.params, ['strategy', 'enabled_setup']) as string | undefined) ??
    strategies[0]?.key ??
    'vwap_pullback_long'
  const isVwap = enabledSetup.startsWith('vwap')
  const strategy = strategies.find(s => s.key === enabledSetup)
  const displayName = strategy?.display_name ?? enabledSetup

  const knobLines: Array<[string, string]> = [
    ['Account', `$${knobs.account_value.toLocaleString()}`],
    ['Risk / trade', `${knobs.max_risk_per_trade_pct}%`],
    ['Position cap', `${knobs.max_position_value_pct}%`],
    ['Max consec. losses', String(knobs.max_consecutive_losses)],
    ['Opening range', `${knobs.opening_range_minutes} min`],
    ['Risk : reward', `${knobs.risk_reward} : 1`],
    ['Stop buffer', `${knobs.stop_buffer_pct}%`],
    ...(isVwap
      ? ([['Max dist from VWAP', `${knobs.max_distance_from_vwap_pct}%`]] as Array<[string, string]>)
      : []),
  ]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="strategy-dropdown-trigger"
          title={config?.summary}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '6px 18px',
            minWidth: 280,
            borderRadius: 'var(--r-pill, 999px)',
            border: '1px solid var(--border)',
            background: 'var(--surface-2)',
            color: 'var(--text)',
            cursor: 'pointer',
            fontSize: 'var(--fs-sm, 13px)',
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>Strategy</span>
          <span style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>
            {config?.name ?? '…'}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs, 11px)' }}>
            {displayName}
          </span>
          <span aria-hidden style={{ color: 'var(--text-muted)' }}>
            ▾
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        sideOffset={8}
        style={{
          width: 380,
          padding: 16,
          background: 'var(--surface)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--r-md)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 'var(--fs-sm)', fontWeight: 700 }}>Strategy</h3>
        <p style={{ margin: '2px 0 12px', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
          Pick the active strategy. Knobs are read-only here — edit them on the
          Strategies page.
        </p>

        <select
          aria-label="active strategy"
          data-testid="strategy-dropdown-config"
          value={config?.id ?? ''}
          disabled={activate.isPending || configs.length === 0}
          onChange={e => {
            const next = configs.find(c => c.id === e.target.value)
            if (next && !next.is_active) activate.mutate(next.id)
          }}
          style={{
            width: '100%',
            padding: '8px 10px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm, 6px)',
            background: 'var(--surface-2)',
            color: 'var(--text)',
            fontSize: 'var(--fs-sm, 13px)',
            fontFamily: 'var(--mono)',
          }}
        >
          {configs.length === 0 ? (
            <option>Loading…</option>
          ) : (
            configs.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.is_active ? ' (active)' : ''}
              </option>
            ))
          )}
        </select>

        <div
          data-testid="strategy-description"
          style={{
            marginTop: 12,
            padding: '10px 12px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md, 8px)',
            background: 'var(--surface-2, #f6f7f9)',
            fontSize: 'var(--fs-xs, 11px)',
            color: 'var(--text)',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm, 13px)', marginBottom: 4 }}>
            {displayName}
          </div>
          {/* 025: the active config's auto-derived human summary */}
          {config?.summary && (
            <div style={{ marginBottom: 8 }}>
              <ConfigSummary summary={config.summary} highlights={config.highlights} />
            </div>
          )}
          {strategy?.description && (
            <p style={{ margin: '0 0 8px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {strategy.description}
            </p>
          )}
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '3px 12px',
              margin: 0,
            }}
          >
            {knobLines.map(([label, value]) => (
              <span key={label} style={{ display: 'contents' }}>
                <dt style={{ color: 'var(--text-muted)' }}>{label}</dt>
                <dd className="mono" style={{ margin: 0, textAlign: 'right' }}>{value}</dd>
              </span>
            ))}
          </dl>
        </div>

        <button
          type="button"
          onClick={() => {
            setOpen(false)
            navigate({ to: '/strategies' })
          }}
          style={{
            marginTop: 12,
            width: '100%',
            padding: '8px 12px',
            borderRadius: 'var(--r-sm, 6px)',
            border: '1px solid var(--border)',
            background: 'var(--accent, #2563eb)',
            color: 'white',
            fontSize: 'var(--fs-sm, 13px)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Create new strategy
        </button>
      </PopoverContent>
    </Popover>
  )
}
