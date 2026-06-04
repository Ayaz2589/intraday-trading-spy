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
    account_value: num(get(p, ['risk', 'account_value']), 25000),
    max_risk_per_trade_pct: num(get(p, ['risk', 'max_risk_per_trade_pct']), 0.1),
    max_position_value_pct: num(get(p, ['risk', 'max_position_value_pct']), 400),
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
