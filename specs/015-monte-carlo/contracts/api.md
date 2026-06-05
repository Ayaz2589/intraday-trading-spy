# API Contracts — Monte Carlo Path-Risk Analysis (015)

Base path `/api`. Auth: existing Supabase JWT (unchanged). One new endpoint;
nothing else changes.

## NEW — `POST /api/validation/monte-carlo`

Compute the Monte Carlo path-risk analysis for one owned run, on demand.
Deterministic (seeded), never persisted, no journal side effects. Mirrors
`POST /api/validation/significance` in shape and flow.

**Request** (`MonteCarloRequest`):

```json
{ "run_id": "9f4e1c2a-…" }
```

**Response `200 OK`** (`MonteCarloResult`):

```json
{
  "shuffle": {
    "max_drawdown_pct":        { "observed": 9.1,  "p5": 6.8,  "p25": 8.9,  "p50": 10.4, "p75": 12.6, "p95": 16.2 },
    "max_drawdown_dollars":    { "observed": 2275, "p5": 1700, "p25": 2225, "p50": 2600, "p75": 3150, "p95": 4050 },
    "longest_losing_streak":   { "observed": 5,    "p5": 4,    "p25": 5,    "p50": 6,    "p75": 7,    "p95": 9 },
    "longest_underwater_trades": { "observed": 41, "p5": 28,   "p25": 40,   "p50": 54,   "p75": 71,   "p95": 97 }
  },
  "cone": {
    "horizon_trades": 312,
    "steps": [
      { "trade_index": 1,   "p5": 24850, "p25": 24940, "p50": 25010, "p75": 25080, "p95": 25170 },
      { "trade_index": 157, "p5": 24210, "p25": 25390, "p50": 26240, "p75": 27110, "p95": 28490 },
      { "trade_index": 312, "p5": 23100, "p25": 25820, "p50": 27940, "p75": 30060, "p95": 33310 }
    ]
  },
  "terminal_equity": { "observed": 27940, "p5": 23100, "p25": 25820, "p50": 27940, "p75": 30060, "p95": 33310 },
  "ruin": [
    { "threshold_pct": 5,  "probability": 0.38 },
    { "threshold_pct": 10, "probability": 0.12 },
    { "threshold_pct": 20, "probability": 0.014 }
  ],
  "iterations": 2000,
  "seed": 20260604,
  "trade_count": 312,
  "starting_equity": 25000.0,
  "low_confidence": false
}
```

(`steps` shown truncated; real response has ≤ `max_cone_steps` = 200 entries,
always including the first and final trade index.)

**Errors**

| Status | Condition | Body shape |
|---|---|---|
| 401 | missing/invalid JWT | existing auth envelope (unchanged) |
| 404 | unknown `run_id`, or run not owned by caller | existing error envelope, `"run not found"` (same as significance) |
| 422 | run has fewer than 2 trades | error envelope with plain-English reason, e.g. `"this run has 1 trade — at least 2 are needed to simulate reorderings"` |
| 422 | run has no stored trade data (pre-010 vintage) | plain-English reason, e.g. `"this run has no stored per-trade data; re-run it to enable simulation"` |
| 422 | run's config snapshot lacks a readable starting equity | plain-English reason |

**Semantics**

- Trades loaded via the same path the significance flow uses
  (`storage.list_trades`, chronological order, net-of-cost PnLs).
- Starting equity comes from the run's frozen
  `config_snapshot.risk.account_value` — NOT the live config (FR-006).
- `low_confidence: true` when `trade_count < metrics.low_confidence_trade_count`
  (default 30); the computation still runs.
- Identical request + identical config → byte-identical response (FR-005).
- The in-sample caveat is a frontend concern (run `segment` is already known
  client-side); this endpoint neither knows nor cares about segments.
