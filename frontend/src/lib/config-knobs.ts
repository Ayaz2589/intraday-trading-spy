import type { Config } from '@/api/types'

// Shared between the topbar strategy dropdown and the config-manager (Feature
// 012). One source of truth for reading a config's tunable knobs and writing
// them back into the nested {risk, strategy} shape config.yaml expects.

export interface KnobValues {
  account_value: number
  max_risk_per_trade_pct: number
  max_position_value_pct: number
  max_consecutive_losses: number
  opening_range_minutes: number
  risk_reward: number
  stop_buffer_pct: number
  max_distance_from_vwap_pct: number
}

// Mirror of backend/config/config.yaml (verified 2026-06-05) — drives the
// editor's "default x" hints, changed-field highlights, and the config rows'
// "N off default" chips.
export const KNOB_DEFAULTS: KnobValues = {
  account_value: 25000,
  max_risk_per_trade_pct: 0.1,
  max_position_value_pct: 400,
  max_consecutive_losses: 2,
  opening_range_minutes: 15,
  risk_reward: 2.0,
  stop_buffer_pct: 0.05,
  max_distance_from_vwap_pct: 0.25,
}

/** Knobs that differ from the built-in defaults (drives "N off default"). */
export function offDefaultKeys(knobs: KnobValues): (keyof KnobValues)[] {
  return (Object.keys(KNOB_DEFAULTS) as (keyof KnobValues)[]).filter(
    k => knobs[k] !== KNOB_DEFAULTS[k],
  )
}

/** Compact summary chips for a collapsed config row. Number→string keeps JS
 *  default formatting (no trailing zeros: 2.0 → "2"). */
export function knobChips(knobs: KnobValues): { label: string; value: string }[] {
  return [
    { label: 'risk', value: `${knobs.max_risk_per_trade_pct}%` },
    { label: 'cap', value: `${knobs.max_position_value_pct}%` },
    { label: 'R:R', value: `${knobs.risk_reward}` },
    { label: 'lockout', value: `${knobs.max_consecutive_losses}` },
  ]
}

/** Collapsed-row chips with diff awareness (strategy-page cleanup, prototype
 *  kchip.diff): the four fixed summary chips each tagged off-default, PLUS a
 *  chip per off-default knob outside the fixed four — without these, configs
 *  differing only in e.g. stop buffer are indistinguishable collapsed. */
export function configDiffChips(
  knobs: KnobValues,
): { label: string; value: string; diff: boolean }[] {
  const summaryKeys: (keyof KnobValues)[] = [
    'max_risk_per_trade_pct', 'max_position_value_pct', 'risk_reward', 'max_consecutive_losses',
  ]
  const chips = knobChips(knobs).map((chip, i) => ({
    ...chip,
    diff: knobs[summaryKeys[i]] !== KNOB_DEFAULTS[summaryKeys[i]],
  }))
  const extras: { key: keyof KnobValues; label: string; value: string }[] = [
    { key: 'account_value', label: 'acct', value: `$${knobs.account_value.toLocaleString('en-US')}` },
    { key: 'opening_range_minutes', label: 'OR', value: `${knobs.opening_range_minutes}min` },
    { key: 'stop_buffer_pct', label: 'stop', value: `${knobs.stop_buffer_pct}%` },
    { key: 'max_distance_from_vwap_pct', label: 'vwap', value: `${knobs.max_distance_from_vwap_pct}%` },
  ]
  for (const e of extras) {
    if (knobs[e.key] !== KNOB_DEFAULTS[e.key]) chips.push({ label: e.label, value: e.value, diff: true })
  }
  return chips
}

/** Read a nested key path, defaulting to undefined. */
export function get(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj
  for (const k of path) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[k]
  }
  return cur
}

export function knobsFromConfig(config: Config | undefined): KnobValues {
  const p = (config?.params ?? {}) as Record<string, unknown>
  const num = (v: unknown, fallback: number) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
    return Number.isFinite(n) ? n : fallback
  }
  return {
    account_value: num(get(p, ['risk', 'account_value']), KNOB_DEFAULTS.account_value),
    max_risk_per_trade_pct: num(get(p, ['risk', 'max_risk_per_trade_pct']), KNOB_DEFAULTS.max_risk_per_trade_pct),
    max_position_value_pct: num(get(p, ['risk', 'max_position_value_pct']), KNOB_DEFAULTS.max_position_value_pct),
    max_consecutive_losses: num(get(p, ['risk', 'max_consecutive_losses']), KNOB_DEFAULTS.max_consecutive_losses),
    opening_range_minutes: num(get(p, ['strategy', 'opening_range', 'minutes']), KNOB_DEFAULTS.opening_range_minutes),
    risk_reward: num(get(p, ['strategy', 'vwap_pullback', 'target', 'risk_reward']), KNOB_DEFAULTS.risk_reward),
    stop_buffer_pct: num(get(p, ['strategy', 'vwap_pullback', 'stop', 'buffer_pct']), KNOB_DEFAULTS.stop_buffer_pct),
    max_distance_from_vwap_pct: num(
      get(p, ['strategy', 'vwap_pullback', 'max_distance_from_vwap_pct']),
      KNOB_DEFAULTS.max_distance_from_vwap_pct,
    ),
  }
}

/** Build the nested params object that the backend / config.yaml shape expects. */
export function buildParams(
  knobs: KnobValues,
  enabledSetup: string,
): Record<string, unknown> {
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

// Feature 017: friendly labels keyed by dotted knob path — mirrors the
// backend knob registry (validation/knobs.py) for rendering Claude's
// suggested_config_changes. Fallback for unknown paths: the path leaf.
export const KNOB_PATH_LABELS: Record<string, string> = {
  'risk.account_value': 'account value ($)',
  'risk.max_risk_per_trade_pct': 'max risk per trade (%)',
  'risk.max_position_value_pct': 'max position value (% of account)',
  'risk.max_consecutive_losses': 'max consecutive losses',
  'strategy.opening_range.minutes': 'opening range (minutes)',
  'strategy.vwap_pullback.target.risk_reward': 'risk:reward target',
  'strategy.vwap_pullback.stop.buffer_pct': 'stop buffer (%)',
  'strategy.vwap_pullback.max_distance_from_vwap_pct': 'max distance from VWAP (%)',
}

export function knobLabel(path: string): string {
  return KNOB_PATH_LABELS[path] ?? path.split('.').pop() ?? path
}

// Sensitivity-study launcher: every registry knob with the default value grid
// the study seeds when the knob is picked. Grids ascend, stay inside the
// backend registry bounds (validation/knobs.py), and sweep across the knob's
// config default so "default vs neighbors" is always part of the answer.
export interface SensitivityKnob {
  path: string
  label: string
  defaults: number[]
}

export const SENSITIVITY_KNOBS: SensitivityKnob[] = [
  { path: 'strategy.vwap_pullback.target.risk_reward', defaults: [1.5, 2.0, 2.5, 3.0] },
  { path: 'strategy.vwap_pullback.stop.buffer_pct', defaults: [0.0, 0.05, 0.1, 0.2] },
  { path: 'strategy.vwap_pullback.max_distance_from_vwap_pct', defaults: [0.1, 0.25, 0.5, 1.0] },
  { path: 'strategy.opening_range.minutes', defaults: [10, 15, 20, 30] },
  { path: 'risk.max_risk_per_trade_pct', defaults: [0.05, 0.1, 0.2, 0.5] },
  { path: 'risk.max_position_value_pct', defaults: [100, 200, 400, 800] },
  { path: 'risk.max_consecutive_losses', defaults: [1, 2, 3, 4] },
  { path: 'risk.account_value', defaults: [10_000, 25_000, 50_000, 100_000] },
].map(k => ({ ...k, label: knobLabel(k.path) }))
