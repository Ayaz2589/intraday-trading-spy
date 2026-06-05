# Research — Monte Carlo Path-Risk Analysis (015)

All unknowns from Technical Context resolved. Grounded against code on
2026-06-04 (branch `015-monte-carlo`, base `f6500f0`).

## R1 — Resampling implementation: hand-rolled seeded numpy, no new dependency

**Decision**: implement shuffle + IID bootstrap with `np.random.default_rng(seed)`
(`rng.permutation`, `rng.choice`) in a new pure module
`validation/monte_carlo.py`, exactly the precedent set by `significance.py`.

**Rationale**: the resampling primitive is 1 line each; the real work
(~80–100 lines) is the domain-specific path statistics (drawdown, streaks,
underwater, cone, ruin), which no maintained library provides. In-house keeps
every number explainable in HelpTooltips (Principle VI) and avoids the
Docker dep-drift failure mode.

**Alternatives considered**:
- `scipy.stats.bootstrap` — replaces only the resampling line; adds indirection
  over what `significance.py` already hand-rolls.
- `arch.bootstrap` (stationary/block bootstrap) — only relevant for
  autocorrelated bar-level return series; per-trade PnLs are resampled IID by
  standard practice. Recorded as the explicit upgrade path if bar-level MC is
  ever wanted.
- `quantstats` (tearsheets, not a simulator), `pyfolio`/`empyrical`
  (abandoned), `vectorbt` (competing engine; clashes with the
  strategy→risk-veto→broker architecture; open-core licensing) — all rejected.

## R2 — Journaling: parity with significance = no journal writes (spec FR-011 amended)

**Finding**: the design doc and the original FR-011 assumed significance
computations are journaled. They are not —
`run_significance_for_run()` (`api/validation_lifecycle.py:297-359`) inserts
no journal event (only the lockbox flow journals, because it spends one-shot
state).

**Decision**: MC writes nothing to the journal. It is a read-only,
deterministic, repeatable analytics computation — not a trade-lifecycle event
(execution / rejection / skipped setup / risk decision / P&L), which is
Principle VII's scope. The reproducibility metadata echoed in every response
(seed, iterations, trade_count) is the audit trail: any displayed number can
be regenerated exactly.

**Action**: spec FR-011 and US4 acceptance scenario 4 amended to require *no
persistence or journal side effects* (parity with significance) instead of
journaling. This is a premise correction, not a scope change.

**Alternatives considered**: adding a journal event per MC click — rejected:
it would journal more than significance does, add a write per button press for
a stateless computation, and put non-trade-lifecycle noise in the journal.

## R3 — Starting equity: parse `risk.account_value` from the run's `config_snapshot`

**Decision**: read starting equity from the run row's frozen
`config_snapshot.risk.account_value` (snapshot guaranteed since migration
0092). If the snapshot is missing or unparseable → 422 with a plain-English
reason (treated like missing trade data).

**Rationale**: FR-006 mandates the run's own frozen config so the simulation
is faithful to the conditions the run actually traded under (current default:
25,000.0 at `backend/config/config.yaml:50`).

**Note (out of scope)**: significance currently uses the *live* config's
`cfg.risk.account_value` (`validation_lifecycle.py:317`) rather than the
snapshot. Not changed here; flagged as possible future cleanup.

## R4 — Trade inputs: `storage.list_trades()` net PnLs in chronological order

**Decision**: load trades exactly as the significance flow does
(`storage.list_trades(run_id=…, user_id=…, limit=100000)`,
`validation_lifecycle.py:315`) and use per-trade **net** PnL dollars (net of
costs since Feature 010) in stored chronological order as the engine input.
Ownership is enforced the same way (`storage.get_run(run_id, user_id)` → None
→ 404).

## R5 — Config block: `validation.monte_carlo`, mirroring `SignificanceConfig`

**Decision**: new `MonteCarloConfig` Pydantic model in `config.py` (beside
`SignificanceConfig` at :167), nested in `ValidationConfig`, with YAML at
`backend/config/config.yaml` under `validation.monte_carlo`:

```yaml
monte_carlo:
  iterations: 2000
  seed: 20260604
  ruin_thresholds_pct: [5, 10, 20]
  horizon_trades: null   # null → match observed trade count
  max_cone_steps: 200
```

One `iterations` knob drives both methods (shuffle and bootstrap) — two knobs
add config surface without a use case. `max_cone_steps` lives in config (no
magic numbers).

## R6 — Low-confidence threshold: reuse `metrics.low_confidence_trade_count`

**Decision**: `low_confidence = trade_count < cfg.metrics.low_confidence_trade_count`
(default 30, `config.py:110`, `config.yaml:86`) — the same convention
`WindowMetrics` uses. No new threshold.

## R7 — Cone downsampling: even index selection over full-resolution paths

**Decision**: compute percentile bands on the full per-step equity matrix,
then report ≤ `max_cone_steps` steps selected at evenly spaced trade indices
(always including the first and final step). Percentile values at the sampled
steps are computed from the full paths, so sampling never changes them
(satisfies US2 acceptance scenario 2 literally).

**Alternatives considered**: simulating only at sampled steps (changes
values — rejected); LTTB-style adaptive sampling (overkill for monotone-ish
bands — rejected).

## R8 — Percentiles: `np.percentile` linear interpolation, P5/P25/P50/P75/P95 fixed

**Decision**: fixed percentile set (matches the spec/UI everywhere), numpy
default linear interpolation — consistent with `significance.py`'s percentile
bootstrap. Not configurable in v1 (no use case; keeps payload shape stable).

## R9 — Charting: hand-rolled SVG components, like `equity-curve.tsx`

**Decision**: the histogram (drawdown distribution) and fan chart (cone) are
small hand-rolled SVG renders inside `monte-carlo-panel.tsx`, following the
existing dependency-free `equity-curve.tsx` precedent.

**Rationale**: the only charting dependency is `klinecharts` (OHLC-oriented;
wrong tool for histograms/bands). A new charting dep contradicts R1's
no-new-dependency stance. Both visuals are simple: bars + stacked band
polygons with a median polyline.

## R10 — In-sample caveat: frontend-only rule from existing run fields

**Decision**: the caveat banner renders when `run.segment` is **not**
`'validation'` and **not** `'lockbox'` (covers `'train'`, `null`/absent —
i.e., no-segment sensitivity children and all plain backtests), per the
spec's Session 2026-06-04 clarification. `Run.segment` is already on the
frontend type (`frontend/src/api/types.ts:52-54`, Feature 014); no API change
needed.

## R11 — Path-statistic definitions (locked for tests)

- **Equity path**: `equity[k] = starting_equity + cumsum(pnl)[k]`, k = 1..N,
  with `equity[0] = starting_equity` as the implicit origin.
- **Max drawdown ($)**: `max(running_peak − equity)` over the path
  (peak seeded at starting equity). **Max drawdown (%)**: max over the path of
  `(running_peak − equity) / running_peak` (peak-relative, matching how the
  app reports drawdown elsewhere).
- **Longest losing streak**: longest run of consecutive trades with
  `pnl < 0` (zero-PnL trades break streaks).
- **Longest underwater period**: longest run of consecutive trades during
  which `equity < running_peak` (i.e., trades strictly below the prior peak;
  ends when a new peak is set or matched).
- **Ruin at threshold t%**: a path is ruined iff
  `min(equity) ≤ starting_equity × (1 − t/100)` at any step.
- **Observed values**: the same statistics computed once on the actual stored
  trade order.
