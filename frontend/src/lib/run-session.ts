/**
 * Pick the chart session to display.
 *
 * Returns the user's picked session when it's still valid for the current run,
 * otherwise the first available session (or null when there are none).
 *
 * Switching runs re-renders the detail view without remounting, so the picked
 * session can be a date from the *previous* run that doesn't exist in the new
 * run's bars. Falling back to the first session keeps the chart populated
 * instead of filtering bars down to an empty set (a blank chart).
 */
export function resolveSession(sessions: string[], picked: string | null): string | null {
  if (picked && sessions.includes(picked)) return picked
  return sessions[0] ?? null
}
