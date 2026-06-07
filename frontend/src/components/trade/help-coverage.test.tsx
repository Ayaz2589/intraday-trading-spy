// Feature 021 T044 (SC-010) — every /trade concept ships a HelpTooltip with
// real content: what is this, why does it matter, how is the app using it.
import { describe, it, expect } from 'vitest'
import { HELP_CONTENT } from '../help-content'

const TRADE_CONCEPTS = [
  'automation_session',
  'armed_session',
  'paper_account',
  'sizing_account_value',
  'protective_orders',
  'reconcile_drift',
  'stale_data_pause',
  'forward_record',
  'manual_order',
  'live_journal',
] as const

describe('Feature 021 HelpTooltip coverage', () => {
  it('every trade concept has substantive help content', () => {
    for (const key of TRADE_CONCEPTS) {
      const entry = HELP_CONTENT[key]
      expect(entry, `missing help content for ${key}`).toBeTruthy()
      expect(entry.title.length).toBeGreaterThan(2)
      // substantive: explains, not just labels
      expect(entry.description.length, `${key} description too thin`).toBeGreaterThan(80)
    }
  })
})
