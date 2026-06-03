# Phase 1 — API Contract: Validation Engine

New router `api/routers/validation.py`, mounted under `/api/validation`. All endpoints are authenticated (JWT → `auth_user_id`) and owner-scoped via `SupabaseStorageClient(user_id=...)`. Like the existing start-backtest boundary, **no endpoint accepts `symbol`, `direction`, or `live_auto_enabled`** — those are server-pinned. Studies run as background tasks; clients poll status (same pattern as `/api/runs/{id}/status`).

Conventions: request/response bodies are Pydantic models (`api/schemas.py`); errors use FastAPI `HTTPException` with the existing problem shape. Money/metric fields mirror `SummaryMetrics`.

---

## 1. Launch a walk-forward or sensitivity study

`POST /api/validation/studies`

**Request** (`StartStudyRequest`):
```jsonc
{
  "kind": "walk_forward" | "sensitivity",
  "config_name": "default",            // existing per-user config; base for the study
  "segment": "train" | "validation" | "train_validation",  // where evaluations run (never lockbox here)

  // kind == "walk_forward" (all optional → config defaults):
  "walk_forward": { "mode": "rolling", "train_months": 12, "step_months": 6, "validation_months": 6 },

  // kind == "sensitivity" (required for sensitivity):
  "grid": [                            // 1 or 2 knobs
    { "knob": "strategy.vwap_pullback.target.risk_reward", "values": [1.5, 2.0, 2.5, 3.0] },
    { "knob": "strategy.vwap_pullback.max_distance_from_vwap_pct", "values": [0.2, 0.3, 0.4] }
  ],
  "metric": "expectancy_dollars",      // optional; defaults to validation.sensitivity.default_metric

  "confirm_large": false               // required true if planned evaluations > max_evaluations_warn
}
```

**Behavior:**
- Validates `config_name` exists; rejects any lockbox-overlapping segment (`409`/`422`).
- Computes `progress_total` (walk-forward window count, or grid-point count). If `> validation.max_evaluations_warn` and `confirm_large != true` → `409 { detail: "large_study", planned_evaluations: N, threshold: T }`.
- Inserts a `queued` `validation_studies` row, enqueues the background task, returns immediately.

**Response** `202` (`StartStudyResponse`): `{ "study_id": "<uuid>", "status": "queued", "planned_evaluations": N }`

**Errors:** `404` unknown config · `409 large_study` · `422` lockbox overlap / invalid grid (≥3-D, empty values) / missing required fields for kind.

---

## 2. List studies

`GET /api/validation/studies?limit=&cursor=`

**Response** (`StudyListResponse`): `{ "studies": [ValidationStudyView, ...], "next_cursor": "<opaque>" | null }`

`ValidationStudyView`:
```jsonc
{ "id": "<uuid>", "kind": "walk_forward", "status": "finished",
  "progress_completed": 11, "progress_total": 11,
  "result": { /* see §5 */ } | null, "failure_reason": null,
  "created_at": "2026-06-03T14:00:00Z" }
```

---

## 3. Get a study (full result)

`GET /api/validation/studies/{study_id}` → `ValidationStudyView` (with populated `result` once `finished`). `404` if not owned/found.

## 4. Poll study status

`GET /api/validation/studies/{study_id}/status` → `ValidationStudyStatusView`:
```jsonc
{ "id": "<uuid>", "status": "running", "progress_completed": 6, "progress_total": 11, "failure_reason": null }
```
Frontend polls this while `status ∈ {queued, running}` (reuses the run-status polling cadence).

Child runs of a study are listed via the existing runs API filtered by study:
`GET /api/runs?study_id={study_id}` → existing `RunListResponse` (each child drillable at `/api/runs/{id}`).

---

## 5. Study `result` payload shapes

**walk_forward** (`WalkForwardResult`):
```jsonc
{
  "kind": "walk_forward",
  "mode": "rolling", "train_months": 12, "step_months": 6, "validation_months": 6,
  "windows": [
    { "window_index": 0,
      "in_sample":     { "segment":"train","range_start":"2018-01-02","range_end":"2018-12-31","run_id":"...","total_trades":420,"expectancy_dollars":3.1,"expectancy_r":0.08,"win_rate":0.41,"profit_factor":1.18,"sharpe":0.9,"total_net_pnl_dollars":1302.0,"low_confidence":false },
      "out_of_sample": { "segment":"validation","range_start":"2019-01-01","range_end":"2019-06-30","run_id":"...","total_trades":205,"expectancy_dollars":1.2,"expectancy_r":0.03,"win_rate":0.39,"profit_factor":1.05,"sharpe":0.4,"total_net_pnl_dollars":246.0,"low_confidence":false },
      "gap": { "expectancy_dollars": -1.9, "expectancy_r": -0.05, "win_rate": -0.02, "profit_factor": -0.13, "sharpe": -0.5 } }
  ],
  "mean_oos": { "expectancy_dollars": 1.0, "sharpe": 0.35, "...": null },
  "mean_gap": { "expectancy_dollars": -2.0, "sharpe": -0.5, "...": null }
}
```

**sensitivity** (`SensitivitySurface`):
```jsonc
{
  "kind": "sensitivity",
  "metric_name": "expectancy_dollars",
  "knobs": ["strategy.vwap_pullback.target.risk_reward", "strategy.vwap_pullback.max_distance_from_vwap_pct"],
  "axes": { "strategy.vwap_pullback.target.risk_reward": [1.5,2.0,2.5,3.0],
            "strategy.vwap_pullback.max_distance_from_vwap_pct": [0.2,0.3,0.4] },
  "segment": "train",
  "points": [ { "coords": {"strategy.vwap_pullback.target.risk_reward":2.0,"strategy.vwap_pullback.max_distance_from_vwap_pct":0.3},
                "metric": 2.4, "trade_count": 3100, "low_confidence": false, "run_id": "..." } ]
}
```

---

## 6. Significance (on a completed result/run)

`POST /api/validation/significance`

**Request** (`SignificanceRequest`): `{ "run_id": "<uuid>" }` — the run (often a study child, e.g. the lockbox or an OOS window) whose trades are tested. Optional overrides: `{ "bootstrap_iterations": 1000, "permutation_iterations": 1000, "confidence": 0.95, "alpha": 0.05, "seed": 20260603 }` (default from `validation.significance`).

**Response** (`SignificanceResult`, see data-model B3):
```jsonc
{ "confidence":0.95,
  "bootstrap":[{"statistic":"expectancy_dollars","point":1.2,"low":-0.3,"high":2.7},
               {"statistic":"sharpe","point":0.4,"low":-0.1,"high":0.95}],
  "permutation_metric":"total_net_pnl_dollars","observed":246.0,
  "p_value":0.082,"alpha":0.05,"significant":false,
  "bootstrap_iterations":1000,"permutation_iterations":1000,"seed":20260603 }
```
**Determinism:** identical `(run_id, iterations, seed)` ⇒ byte-identical response (SC-004). `404` unknown run · `422` run has no completed trades (returns undefined verdict, not an error, if 0/1 trades — clearly labeled).

---

## 7. Lockbox

### 7a. Get lockbox status
`GET /api/validation/lockbox` → `LockboxStatusView` (data-model B4): current `state` (`unspent|spent|burned`), the spending `config_fingerprint`/`run_id`/`result` if any, and the append-only `history`. Range comes from `validation.split.lockbox`.

### 7b. Run the one-shot lockbox test
`POST /api/validation/lockbox/run`

**Request** (`LockboxRunRequest`): `{ "config_name": "default", "override": false }`

**Behavior (state machine, research R9):**
- Computes the freeze fingerprint for the config over the lockbox range.
- **unspent** → runs the one-shot lockbox child eval (`segment='lockbox'`), appends a `spent` ledger row, journals `lockbox_spent`. → `200` with the lockbox `SummaryMetrics` + `state:"spent"`.
- **spent, same fingerprint** → idempotent: returns the recorded result. → `200 state:"spent"`.
- **spent, different fingerprint, `override:false`** → `409 { detail:"lockbox_already_spent", spent_fingerprint:"...", spent_run_id:"..." }`.
- **different fingerprint, `override:true`** → runs it, appends a `burned` row, journals `lockbox_burned` (warn). → `200 { state:"burned", contaminated:true, ... }`.

**Response** (`LockboxRunResponse`): `{ "run_id":"<uuid>", "state":"spent"|"burned", "contaminated": false|true, "summary": { /* SummaryMetrics */ }, "config_fingerprint":"..." }`

---

## 8. Non-goals (this contract)

- No endpoint auto-selects a config, ranks configs, or recommends "the best" — all selection is the operator's (Principle II / FR-022).
- No cross-study aggregation/insights endpoints (per-config distribution, edge time-series) — **feature 012**.
- No live/broker endpoints — backtest only.
