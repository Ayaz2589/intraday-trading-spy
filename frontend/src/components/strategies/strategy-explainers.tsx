import type { ReactNode } from 'react'

// Educational Entry/Stop/Target breakdown per registered strategy, keyed by
// strategy.key (the registry's stable identifier). Frontend-owned prose per
// the 2026-06-05 redesign decision — a key with no entry here simply renders
// no explainer cards.
export type StrategyExplainer = {
  entry: ReactNode
  stop: ReactNode
  target: ReactNode
}

export const STRATEGY_EXPLAINERS: Record<string, StrategyExplainer> = {
  vwap_pullback_long: {
    entry: (
      <>
        Pullback to <strong>VWAP</strong> from above after the opening range,
        confirmed by a close back above the prior bar high.
      </>
    ),
    stop: (
      <>
        Placed <strong>below VWAP</strong> with a configurable buffer — defines
        1R for sizing.
      </>
    ),
    target: (
      <>
        The <strong>opening-range high</strong>, or a configured{' '}
        <strong>R-multiple</strong> if further.
      </>
    ),
  },
}
