import { describe, expect, it } from 'vitest'
import {
  KNOB_DEFAULTS,
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
