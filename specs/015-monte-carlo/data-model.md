# Data Model — Monte Carlo Path-Risk Analysis (015)

No database entities, no migrations, no storage changes. All models are
in-memory Pydantic v2 (frozen, like `SignificanceResult` at `models.py:294`)
plus one config block. Mirrored TypeScript types land in
`frontend/src/api/types.ts`.

## Configuration

### `MonteCarloConfig` (`config.py`, nested as `ValidationConfig.monte_carlo`)

| Field | Type | Default | Notes |
|---|---|---|---|
| `iterations` | `int` | `2000` | drives BOTH shuffle and bootstrap path counts |
| `seed` | `int` | `20260604` | seeds one `np.random.default_rng` per request |
| `ruin_thresholds_pct` | `list[float]` | `[5, 10, 20]` | % below starting equity that counts as ruin |
| `horizon_trades` | `int \| None` | `None` | bootstrap horizon; `None` → observed trade count |
| `max_cone_steps` | `int` | `200` | cone downsampling cap (config, not magic number) |

YAML lives at `backend/config/config.yaml` under `validation.monte_carlo`
(beside `validation.significance`).

## Response model family (`models.py`, all `ConfigDict(frozen=True)`)

### `MonteCarloDistribution`

One statistic's simulated distribution vs. the observed value.

| Field | Type | Notes |
|---|---|---|
| `observed` | `float` | computed on the actual stored trade order |
| `p5`, `p25`, `p50`, `p75`, `p95` | `float` | `np.percentile`, linear interpolation |

### `MonteCarloShuffleStats`

| Field | Type | Notes |
|---|---|---|
| `max_drawdown_pct` | `MonteCarloDistribution` | peak-relative % (research.md R11) |
| `max_drawdown_dollars` | `MonteCarloDistribution` | `max(running_peak − equity)` |
| `longest_losing_streak` | `MonteCarloDistribution` | consecutive `pnl < 0`; integers carried as float |
| `longest_underwater_trades` | `MonteCarloDistribution` | consecutive trades below prior peak |

### `MonteCarloConeStep`

| Field | Type | Notes |
|---|---|---|
| `trade_index` | `int` | 1-based step within the horizon; first and last always present |
| `p5`, `p25`, `p50`, `p75`, `p95` | `float` | equity levels; invariant p5 ≤ p25 ≤ p50 ≤ p75 ≤ p95 |

### `MonteCarloCone`

| Field | Type | Notes |
|---|---|---|
| `horizon_trades` | `int` | resolved horizon (config override or observed count) |
| `steps` | `list[MonteCarloConeStep]` | length ≤ `max_cone_steps` |

### `MonteCarloRuinPoint`

| Field | Type | Notes |
|---|---|---|
| `threshold_pct` | `float` | echoed from config |
| `probability` | `float` | fraction of bootstrap paths ruined ∈ [0, 1] |

### `MonteCarloResult` (endpoint `response_model`)

| Field | Type | Notes |
|---|---|---|
| `shuffle` | `MonteCarloShuffleStats` | US1 |
| `cone` | `MonteCarloCone` | US2 |
| `terminal_equity` | `MonteCarloDistribution` | `observed` = starting equity + sum of actual PnLs |
| `ruin` | `list[MonteCarloRuinPoint]` | US3; same order as config thresholds |
| `iterations` | `int` | reproducibility metadata (FR-005) |
| `seed` | `int` | reproducibility metadata |
| `trade_count` | `int` | number of trades simulated over |
| `starting_equity` | `float` | from the run's `config_snapshot.risk.account_value` |
| `low_confidence` | `bool` | `trade_count < metrics.low_confidence_trade_count` |

## Request schema (`api/schemas.py`)

### `MonteCarloRequest`

| Field | Type |
|---|---|
| `run_id` | `UUID` |

## Validation rules & invariants (tested)

1. **Determinism** (FR-005): same run + same config → identical
   `MonteCarloResult` on every invocation.
2. **Shuffle terminal-equity constancy** (FR-013): every reshuffled path ends
   at `starting_equity + sum(pnls)`; the engine asserts this and raises on
   violation (programming-error guard, not a 4xx).
3. **Band ordering** (FR-013): p5 ≤ p25 ≤ p50 ≤ p75 ≤ p95 at every cone step
   and in every distribution.
4. **Ruin monotonicity** (FR-013): probability non-increasing as
   `threshold_pct` deepens.
5. **Input guards** (FR-008): `< 2` trades or missing trade data → 422 before
   any computation; missing/unparseable `config_snapshot.risk.account_value`
   → 422 (research.md R3).
6. **Cone size** (FR-002): `len(steps) ≤ max_cone_steps`, sampled at evenly
   spaced indices computed on full-resolution paths (research.md R7).

## Frontend types (`frontend/src/api/types.ts`)

TypeScript mirrors of `MonteCarloResult` and members, plus
`MonteCarloRequest`. The caveat rule needs no new fields — `Run.segment`
(`types.ts:52-54`) already exists; banner shows iff
`segment !== 'validation' && segment !== 'lockbox'`.

## State transitions

None — the feature is stateless. Nothing is written to `runs`,
`validation_studies`, `lockbox_ledger`, or the journal.
