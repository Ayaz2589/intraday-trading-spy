import { describe, it, expect } from 'vitest'
import { riskKnobsFromParams } from './run-config'

describe('riskKnobsFromParams', () => {
  it('reads account_value and position cap from the run config params', () => {
    expect(
      riskKnobsFromParams({ risk: { account_value: 500, max_position_value_pct: 50 } }),
    ).toEqual({ accountValue: 500, positionCapPct: 50 })
  })

  it('falls back to defaults when fields are missing', () => {
    expect(riskKnobsFromParams({ risk: {} })).toEqual({
      accountValue: 25000,
      positionCapPct: 100,
    })
  })

  it('falls back when params are null/empty (legacy run with no snapshot)', () => {
    expect(riskKnobsFromParams(null)).toEqual({ accountValue: 25000, positionCapPct: 100 })
    expect(riskKnobsFromParams(undefined)).toEqual({ accountValue: 25000, positionCapPct: 100 })
    expect(riskKnobsFromParams({})).toEqual({ accountValue: 25000, positionCapPct: 100 })
  })

  it('ignores non-numeric values', () => {
    expect(
      riskKnobsFromParams({ risk: { account_value: 'oops', max_position_value_pct: null } }),
    ).toEqual({ accountValue: 25000, positionCapPct: 100 })
  })
})
