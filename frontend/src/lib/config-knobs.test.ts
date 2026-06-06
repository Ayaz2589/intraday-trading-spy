import { describe, expect, it } from 'vitest'
import {
  KNOB_DEFAULTS,
  KNOB_PATH_LABELS,
  SENSITIVITY_KNOBS,
  knobChips,
  knobsFromConfig,
  offDefaultKeys,
} from './config-knobs'
import type { Config } from '@/api/types'

const cfg = (params: Record<string, unknown>): Config => ({
  id: '1',
  name: 'x',
  mode: 'backtest',
  timeframe: '5m',
  strategy_id: 's',
  params,
})

describe('KNOB_DEFAULTS', () => {
  it('mirrors backend/config/config.yaml', () => {
    expect(KNOB_DEFAULTS).toEqual({
      account_value: 25000,
      max_risk_per_trade_pct: 0.1,
      max_position_value_pct: 400,
      max_consecutive_losses: 2,
      opening_range_minutes: 15,
      risk_reward: 2.0,
      stop_buffer_pct: 0.05,
      max_distance_from_vwap_pct: 0.25,
    })
  })

  it('is the fallback for an empty config', () => {
    expect(knobsFromConfig(cfg({}))).toEqual(KNOB_DEFAULTS)
  })
})

describe('offDefaultKeys', () => {
  it('is empty at defaults', () => {
    expect(offDefaultKeys({ ...KNOB_DEFAULTS })).toEqual([])
  })

  it('lists every knob that differs from its default', () => {
    const knobs = { ...KNOB_DEFAULTS, max_position_value_pct: 100, risk_reward: 3 }
    expect(offDefaultKeys(knobs)).toEqual(['max_position_value_pct', 'risk_reward'])
  })
})

describe('knobChips', () => {
  it('formats the four collapsed-row summary chips, trimming trailing zeros', () => {
    expect(knobChips({ ...KNOB_DEFAULTS })).toEqual([
      { label: 'risk', value: '0.1%' },
      { label: 'cap', value: '400%' },
      { label: 'R:R', value: '2' },
      { label: 'lockout', value: '2' },
    ])
  })
})

describe('SENSITIVITY_KNOBS', () => {
  it('covers every registry knob path with its friendly label', () => {
    expect(SENSITIVITY_KNOBS.map(k => k.path).sort()).toEqual(
      Object.keys(KNOB_PATH_LABELS).sort(),
    )
    for (const k of SENSITIVITY_KNOBS) {
      expect(k.label).toBe(KNOB_PATH_LABELS[k.path])
    }
  })

  it('seeds each knob with an ascending default grid that sweeps across its config default', () => {
    const configDefault: Record<string, number> = {
      'risk.account_value': KNOB_DEFAULTS.account_value,
      'risk.max_risk_per_trade_pct': KNOB_DEFAULTS.max_risk_per_trade_pct,
      'risk.max_position_value_pct': KNOB_DEFAULTS.max_position_value_pct,
      'risk.max_consecutive_losses': KNOB_DEFAULTS.max_consecutive_losses,
      'strategy.opening_range.minutes': KNOB_DEFAULTS.opening_range_minutes,
      'strategy.vwap_pullback.target.risk_reward': KNOB_DEFAULTS.risk_reward,
      'strategy.vwap_pullback.stop.buffer_pct': KNOB_DEFAULTS.stop_buffer_pct,
      'strategy.vwap_pullback.max_distance_from_vwap_pct': KNOB_DEFAULTS.max_distance_from_vwap_pct,
    }
    for (const k of SENSITIVITY_KNOBS) {
      expect(k.defaults.length).toBeGreaterThanOrEqual(2)
      expect([...k.defaults].sort((a, b) => a - b)).toEqual(k.defaults)
      expect(k.defaults).toContain(configDefault[k.path])
    }
  })

  it('keeps the risk:reward grid the launcher has always defaulted to', () => {
    const rr = SENSITIVITY_KNOBS.find(k => k.path === 'strategy.vwap_pullback.target.risk_reward')
    expect(rr?.defaults).toEqual([1.5, 2.0, 2.5, 3.0])
  })
})
