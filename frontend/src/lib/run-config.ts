/**
 * Chart-relevant risk knobs derived from a run's config params.
 *
 * The run-detail manifest returns the per-run config snapshot (the knobs the
 * run actually executed with). The price chart uses account value + position
 * cap to explain position sizing on hover, so it must reflect the run's own
 * values — not a hardcoded default. Legacy runs (no snapshot, missing fields)
 * fall back to the engine defaults.
 */
export function riskKnobsFromParams(params: unknown): {
  accountValue: number
  positionCapPct: number
} {
  const risk =
    params && typeof params === 'object'
      ? ((params as Record<string, unknown>).risk as Record<string, unknown> | undefined)
      : undefined

  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback

  return {
    accountValue: num(risk?.account_value, 25000),
    positionCapPct: num(risk?.max_position_value_pct, 100),
  }
}
