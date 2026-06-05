# API Contracts: Recommendation Engine (018)

All endpoints require the existing Supabase bearer auth and are user-scoped.
Deterministic surfaces live under `/api/recommend/*`; advisory generation
reuses the 016 analysis endpoints. This split IS the determinism boundary the
UI must display (FR-013).

## GET /api/recommend/health

Per-config health verdicts for every config with any OOS history.

**Query**: none.

**200 Response**:

```json
{
  "verdicts": [
    {
      "config_id": "…", "config_name": "wf-rr3", "strategy_id": "…",
      "verdict": "failing",
      "inputs": {
        "window_count": 12,
        "recent_median_r": -0.004,
        "baseline_median_r": 0.018,
        "gate_passed": false, "gate_ci_low": -0.71, "gate_ci_high": 2.60
      },
      "thresholds": { "min_windows": 6, "recent_windows": 4, "degradation_margin_r": 0.02 }
    }
  ]
}
```

**Contract notes**: identical archive ⇒ identical response (SC-002);
configs with zero OOS history are omitted; `insufficient_evidence` rows carry
null medians. No side effects, no LLM.

## GET /api/recommend/pack?config_id={uuid}

Evidence pack + deterministic ranked candidates for one config.

**Query**: `config_id` (required UUID).

**200 Response**:

```json
{
  "pack": { "...EvidencePack (data-model.md)...": "" },
  "candidates": [
    {
      "klass": "knob_delta", "rank": 1, "score": 0.062,
      "changes": [{ "knob_path": "strategy.vwap_pullback.target.risk_reward", "value": 2.5 }],
      "evidence": [
        { "metric_path": "sensitivity.0.neighborhood_mean.2.5", "value": 0.041 },
        { "metric_path": "matched.3.other_expectancy_r", "value": 0.029 }
      ],
      "already_tried": null,
      "narrative_hint": "plateau at 2.5–3.0 on risk:reward target"
    },
    { "klass": "stop_tuning", "rank": 9, "score": 0, "changes": [], "evidence": ["…"],
      "already_tried": null, "narrative_hint": "every family gate includes zero" }
  ],
  "trial_counts": { "drafted": 3, "validated": 2 },
  "snapshot_fingerprint": "…"
}
```

**Errors**: `404` unknown config; `422` missing/invalid `config_id`.

**Contract notes**: every `changes[].knob_path` is on the knob registry and
in bounds (FR-006); `already_tried` candidates never offer a draft;
no new backtests are executed (FR-005); deterministic and LLM-free (FR-009).

## POST /api/insights/claude-analysis  (EXISTING — extended)

**Body** (unchanged shape): `{ "scope": "recommend", "scope_id": "<config_id>", "force": false }`

Behavior for `scope='recommend'`: the server builds the EvidencePack as the
payload (same builder as `/api/recommend/pack`), pins by `payload_hash`,
passes `suggested_config_changes` through the 017 whitelist sanitation, and
stores with `scope='recommend'`, `scope_id=config_id`. Billing pause,
idempotency, and `409`-style stale semantics identical to existing scopes.

## GET /api/insights/claude-analysis?scope=recommend&scope_id={config_id}  (EXISTING)

Latest stored recommendation analysis or `204`. Unchanged contract.

## POST /api/configs  (EXISTING — extended request)

**Body addition** (optional):

```json
{ "provenance": { "analysis_id": "<uuid-or-null>", "source": "claude" } }
```

When present, a `recommendation_trials` row is written in the same
transaction as the config insert (FR-011). Omitted ⇒ behavior unchanged.
`source` ∈ `claude | deterministic` (deterministic = drafted from a
candidate card with no analysis). The response is unchanged.

## Explicitly NOT in the contract

- No endpoint mutates configs or launches runs/studies from recommendation
  surfaces (FR-010).
- No endpoint reads lockbox segments (FR-012); pack sources are
  validation-segment rows only (the existing aggregates already filter
  `segment='validation'`).
