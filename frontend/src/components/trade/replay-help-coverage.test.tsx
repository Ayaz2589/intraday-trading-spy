// Feature 022 (T027/T039/T049, SC-007) — every replay concept ships a
// HelpTooltip with substantive content.
import { describe, it, expect } from 'vitest'
import { HELP_CONTENT } from '../help-content'

const REPLAY_CONCEPTS = [
  'replay',
  'simulated_clock',
  'playback_speed',
  'simulated_fill',
  'session_recap',
  'strategy_automation_replay',
] as const

describe('Feature 022 HelpTooltip coverage', () => {
  it('every replay concept has substantive help content', () => {
    for (const key of REPLAY_CONCEPTS) {
      const entry = HELP_CONTENT[key]
      expect(entry, `missing help content for ${key}`).toBeTruthy()
      expect(entry.title.length).toBeGreaterThan(2)
      expect(entry.description.length, `${key} description too thin`).toBeGreaterThan(80)
    }
  })
})
