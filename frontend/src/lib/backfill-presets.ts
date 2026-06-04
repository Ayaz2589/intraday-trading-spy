// Data-page redesign: preset chips for the backfill range. Pure date math —
// the chip fills the FROM/TO inputs; editing an input deselects the chip.

export type PresetKey = 'last30' | 'last90' | 'ytd' | 'full'

// The archive floor: Alpaca SIP history backfilled from 2018 (Feature 009).
export const FULL_HISTORY_START = '2018-01-01'

export const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: 'last30', label: 'Last 30 days' },
  { key: 'last90', label: 'Last 90 days' },
  { key: 'ytd', label: 'Year to date' },
  { key: 'full', label: 'Full history' },
]

function minusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

export function presetRange(key: PresetKey, todayIso: string): { start: string; end: string } {
  switch (key) {
    case 'last30':
      return { start: minusDays(todayIso, 30), end: todayIso }
    case 'last90':
      return { start: minusDays(todayIso, 90), end: todayIso }
    case 'ytd':
      return { start: `${todayIso.slice(0, 4)}-01-01`, end: todayIso }
    case 'full':
      return { start: FULL_HISTORY_START, end: todayIso }
  }
}
