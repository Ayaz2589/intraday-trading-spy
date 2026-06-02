/**
 * Backtest date-range constraints.
 *
 * A backtest may span at most MAX_RANGE_DAYS *inclusive* calendar days — e.g.
 * start 2026-04-01 → latest end 2026-04-05 (start + 4 days).
 */

export const MAX_RANGE_DAYS = 5

/**
 * Add (or subtract, with a negative value) whole days to a YYYY-MM-DD date,
 * returning YYYY-MM-DD. UTC math keeps it free of timezone/DST drift.
 */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Latest selectable end for a start date (inclusive MAX_RANGE_DAYS window). */
export function maxEndForStart(start: string): string {
  return addDays(start, MAX_RANGE_DAYS - 1)
}

/** Lexicographic min of two YYYY-MM-DD strings (chronological for ISO dates). */
export function minIso(a: string, b: string): string {
  return a < b ? a : b
}

/** Clamp an end date into [start, start + (MAX_RANGE_DAYS - 1)]. */
export function clampEnd(start: string, end: string): string {
  if (end < start) return start
  const latest = maxEndForStart(start)
  return end > latest ? latest : end
}
