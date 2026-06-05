# API Contracts — 016 Insights / Pooled Gate / Claude Narrative

Base path `/api`. Auth: existing Supabase JWT. Domain validation errors use
the project's 400 `{"error": "validation_error", "message": ...}` envelope.

## NEW — `POST /api/validation/studies/{study_id}/pooled-gate`

Body: `{"mode": "fast" | "full"}` (default `fast`).

**`mode=fast` → `200 OK`** (`PooledGateResult`, also persisted into the
study's `result.pooled_gate`):

```json
{
  "computed_at": "2026-06-05T09:12:00Z", "mode": "fast",
  "passed": false, "alpha": 0.05,
  "pooled_trades": 2607, "windows_total": 12,
  "windows_with_trades": 12, "windows_positive": 9,
  "total_net_pnl_dollars": 2385.0,
  "expectancy_dollars_ci": { "point": 0.91, "low": -0.53, "high": 2.56 },
  "expectancy_r_ci": { "point": 0.0346, "low": -0.0287, "high": 0.0941 },
  "sign_test_p": 0.0730,
  "monte_carlo": { "...": "015 MonteCarloResult over pooled trades" },
  "seed": 20260605
}
```

**`mode=full` → `202 Accepted`** `{"study_id": "...", "status": "running"}` —
background task; completion lands `per_window_p[]` + `fisher {x2, df, p}` in
`result.pooled_gate` (read via the existing study GET; progress via the
existing study status endpoint).

**Errors**: 404 study not found/owned · 400 sensitivity study ("the pooled
gate applies to walk-forward studies") · 400 no persisted children ("re-run
this study to persist its windows") · 400 <2 pooled trades · 400 inconsistent
child configs · 409 `{"error": "pooled_gate_running"}` full gate already
active for this study.

## NEW — `GET /api/insights/edge-timeseries?config_name=`

`200 OK` (`EdgeTimeseriesResponse`): `points[]` (one per OOS child run:
run/study/window ids, config_name, range, trades, net_pnl, expectancy $/R,
pnl_std — computed from the trades table) + `snapshot_fingerprint`.
`config_name` optional filter. Empty archive → `{"points": [],
"snapshot_fingerprint": "empty"}`.

## NEW — `GET /api/insights/config-distribution`

`200 OK` (`ConfigDistributionResponse`): `rows[]` per config (windows,
windows_positive, pnl/expectancy quartiles, total_trades) +
`snapshot_fingerprint`.

## NEW — `POST /api/insights/claude-analysis`

Body: `{"scope": "study" | "insights", "scope_id": "<study uuid, study scope only>", "force": false}`.

**`200 OK`** (`StoredAnalysisView`) — either freshly generated or the stored
analysis when the latest one for this scope matches the current payload hash
(idempotent; no provider call). `analysis` is the structured
`{summary, findings[], risks[], suggested_experiments[]}`.

**Errors**: 400 unknown scope / missing scope_id / nothing to analyze (empty
archive, or study gate not yet computed) · 409 `{"error": "claude_paused",
"disabled_reason": "billing" | "manual"}` · 503 `{"error":
"claude_unconfigured"}` no API key · 502 provider/parse failures with plain
reason; on provider `billing_error` the response is the 409 claude_paused
shape **and** settings flip to paused server-side.

## NEW — `GET /api/insights/claude-analysis?scope=&scope_id=`

`200 OK` latest `StoredAnalysisView` for the scope, or `204 No Content` if
none exists. Readable regardless of paused state.

## NEW — `GET /api/insights/claude-settings`

`200 OK` (`InsightSettingsView`): `{claude_enabled, disabled_reason,
configured}` (lazily upserts the default row).

## NEW — `PATCH /api/insights/claude-settings`

Body `{"enabled": true | false}` → `200 OK` updated view. Enabling clears
`disabled_reason`; manual disable sets `'manual'`.

**Semantics shared by all insights endpoints**: validation-segment runs only;
owner-scoped; no journal writes; gate computation is seeded-deterministic
while Claude analyses are advisory and non-deterministic (stored once,
regenerated only on changed snapshot or force).
