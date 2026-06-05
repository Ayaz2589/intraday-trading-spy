# Monte Carlo path-risk analysis — design

**Date:** 2026-06-04 · **Status:** approved (brainstorm) · **Feature:** 015-monte-carlo (insights shifts to 016, optional UI lanes to 017)
**Prereqs:** 011 (validation engine), 014 (study child-run persistence — makes every study evaluation a drillable run)

## Problem

The validation engine answers "is this edge real?" (significance: bootstrap CIs +
random-entry permutation) but not "what is the risk of riding it?". The observed
equity curve is one ordering of the trades; path-dependent statistics — max
drawdown, losing streaks, time underwater — are extremely sensitive to that
ordering. Before any paper/live decision the operator needs to know how bad the
path could plausibly get, what range of outcomes to expect going forward, and
the probability of breaching a pain threshold.

## Goals

Monte Carlo simulation on a run's trades, answering three questions:

1. **Drawdown / path risk** — distribution of max drawdown, longest losing
   streak, and longest underwater period across reorderings of the real trades.
2. **Forward projection cone** — percentile bands of plausible equity paths over
   the next N trades.
3. **Risk of ruin** — probability that equity dips below starting equity by ≥ a
   configured threshold at any point in the horizon.

"Luck vs. edge" is explicitly NOT a goal — that remains the significance panel's
job.

## Decision summary

- **Attach at the run level.** The MC panel lives on the run detail page, like
  the significance panel. Because of 014, this single surface covers standalone
  backtests, walk-forward IS/OOS window children, sensitivity grid-point
  children, and the lockbox run.
- **Feature 015** in the roadmap; insights/aggregation becomes 016, optional UI
  lanes 017.
- **Hand-rolled seeded numpy; no new dependency.** Evaluated libraries:
  `scipy.stats.bootstrap` (replaces only the one-line resampling, not the path
  stats), `arch.bootstrap` (stationary/block bootstrap — only relevant for
  autocorrelated bar-level returns, not per-trade PnLs; noted as the upgrade
  path if bar-level MC is ever wanted), `quantstats` (tearsheets, not a
  simulator), `pyfolio`/`empyrical` (abandoned), `vectorbt` (a competing
  engine; clashes with the strategy → risk-veto → broker architecture). The
  domain-specific path statistics (~80–100 lines) must be written either way;
  resampling is `rng.permutation` / `rng.choice`. In-house seeded numpy matches
  the `significance.py` precedent and keeps every number explainable in
  tooltips.
- **On-demand compute, no persistence.** Seeded + deterministic → recompute on
  view returns identical numbers; same trade-off significance made.
- **Panel layout A** (single stacked card) chosen via visual companion.

## Engine — `validation/monte_carlo.py`

New module beside `significance.py`: pure functions over a run's chronological
trade net-PnL list plus the run's configured starting account equity. Seeded
`np.random.default_rng` throughout.

### Method 1 — Shuffle (path risk)

For each of N iterations, permute the order of the exact observed trades and
walk the cumulative equity path. The trade set is identical in every path, so
terminal equity never changes — only path-dependent statistics vary (that is
the point; the implementation asserts this invariant). Per path:

- **Max drawdown** — % from running peak, and dollars
- **Longest losing streak** — consecutive losing trades
- **Longest underwater period** — most trades spent below a prior equity peak

Output per statistic: distribution percentiles (P5/P25/P50/P75/P95) plus the
observed (actual-order) value for comparison — e.g. "your real curve's 9%
drawdown sits near P40; P95 is 16%".

### Method 2 — Bootstrap (cone + ruin)

For each of N iterations, draw `horizon_trades` PnLs **with replacement** from
the observed set and walk the path forward from starting equity. Output:

- **Cone** — per-step P5/P25/P50/P75/P95 equity bands, downsampled to ≤200
  steps for payload size
- **Risk of ruin** — fraction of paths where equity dips below starting equity
  by ≥ each configured threshold at any point during the horizon
- **Terminal equity** — percentiles

### Config — `MonteCarloConfig` (config.py + config.yaml)

Mirrors `SignificanceConfig`; no magic numbers (constitution):

```yaml
monte_carlo:
  iterations: 2000
  seed: 20260604            # deterministic, reproducible
  ruin_thresholds_pct: [5, 10, 20]
  horizon_trades: null      # null → match the run's observed trade count
```

### Guards

- 0 or 1 trades → refuse (422 with plain-English reason)
- Below the existing low-confidence trade threshold → compute, set
  `low_confidence: true` (same convention as WindowMetrics)

## API

```
POST /api/validation/monte-carlo   { "run_id": "..." }
```

Flow: auth (user owns run) → load the run's trades via the same loader the
significance flow uses (`api/validation_lifecycle.py`) → starting equity from
the run's `config_snapshot` → `MonteCarloConfig` from app config → compute both
methods → return result. Computation journaled like significance (Principle
VII). Response echoes `seed`, `iterations`, `trade_count` for reproducibility.

### Response shape — Pydantic `MonteCarloResult`

- `shuffle`: per stat (`max_drawdown_pct`, `max_drawdown_dollars`,
  `longest_losing_streak`, `longest_underwater_trades`) →
  `{ observed, p5, p25, p50, p75, p95 }`
- `cone`: `{ horizon_trades, steps: [{ trade_index, p5, p25, p50, p75, p95 }] }`
- `ruin`: `[{ threshold_pct, probability }]`
- `terminal_equity`: percentiles
- `iterations`, `seed`, `trade_count`, `low_confidence`

### Errors

- 404 — run not found / not owned
- 422 — fewer than 2 trades, or no stored trade data (human-readable reason)

The in-sample caveat needs no API support — the run detail page already knows
the run's `segment`.

## UI — `MonteCarloPanel` on the run detail page

Layout A: single stacked card beside the significance panel.

1. Header: "Monte Carlo risk" + `?` HelpTooltip + **Run simulation** button
   (on-demand, like significance)
2. **In-sample caveat banner** when the run is a train-segment child or a plain
   backtest: "These trades are in-sample; risk estimates are optimistic. Prefer
   OOS windows or the lockbox run."
3. **Drawdown risk** — observed / P50 / P95 table for the three shuffle stats +
   small max-drawdown histogram
4. **Forward cone** — fan chart (P5–P95 bands, median line) over the horizon
5. **Risk of ruin** — inline probabilities per threshold

Every concept gets a `?` HelpTooltip (what is this / why it matters / how the
app computes it — including iterations + seed). Low-confidence badge reuses the
existing styling. Error and "not enough trades" states render the API reason.

### Where it applies

| Surface | Notes |
|---|---|
| Lockbox run | Gold-standard input (true OOS); exists only after the wf-rr3 significance gate passes |
| Walk-forward OOS windows | The honest pre-lockbox input — where MC earns its keep today |
| Walk-forward IS windows | Works; caveat banner (in-sample optimism) |
| Sensitivity grid points | Works; occasionally useful |
| Standalone backtests | Works; caveat banner |

## Edge cases & invariants

- Shuffle terminal equity is constant by construction — asserted in the engine
- Determinism: same run + same config → byte-identical response
- Cone band ordering: P5 ≤ P25 ≤ P50 ≤ P75 ≤ P95 at every step
- Ruin monotonicity: P(ruin at −5%) ≥ P(ruin at −10%) ≥ P(ruin at −20%)
- Downsampling never exceeds 200 cone steps

## Testing (TDD)

- **Unit, path stats**: hand-computed tiny cases (e.g. 4 trades) verifying max
  drawdown (% and $), streaks, underwater period on paper
- **Unit, engine**: determinism; shuffle invariant; cone band ordering; ruin
  monotonicity; downsampling cap
- **API contract**: ownership 404; 422 reasons; response schema; journaling
- **Frontend**: panel renders all sections from a fixture; caveat banner only
  for in-sample runs; tooltips present; error + low-confidence states

## Constitution touchpoints

- I/II/V — unchanged (SPY-only, rule-based, no live)
- III — untouched; MC reads completed trades, places no orders
- IV — TDD as above
- VI — HelpTooltips on every MC concept
- VII — MC computations journaled

## Out of scope (explicit)

- **Pooled-OOS MC** (all OOS trades across a study's windows as one input) —
  the natural follow-up if individual OOS windows prove too thin; deferred by
  decision
- **Bar-level / block-bootstrap resampling** (`arch.bootstrap`) — only needed if
  resampling autocorrelated return series rather than per-trade PnLs
- **Persistence of MC results** — deterministic recompute is cheap
- **A `monte_carlo` study kind** — rejected: the study orchestrator exists to
  re-run the engine and persist children; MC re-runs nothing
- **Position-sizing optimization from MC output** — read-only risk reporting
  only (Principle II)
