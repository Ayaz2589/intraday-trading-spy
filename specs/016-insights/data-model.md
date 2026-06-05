# Data Model — 016 Insights / Pooled Gate / Claude Narrative

One migration (0123). One jsonb extension on an existing table. Pydantic
families mirrored into TS (`frontend/src/api/types.ts`).

## A. `pooled_gate` (additive key inside `validation_studies.result` jsonb)

Written via read-modify-write (research R2). Shape (jsonb):

| Key | Type | Notes |
|---|---|---|
| `computed_at` | ISO timestamp | stamped each (re)compute |
| `mode` | `"fast"` \| `"full"` | full ⊇ fast |
| `passed` | bool | `expectancy_dollars_ci.low > 0` |
| `alpha` | float | from config |
| `pooled_trades` | int | |
| `windows_total` / `windows_with_trades` / `windows_positive` | int | disclosure: "11 of 12 contributed" |
| `total_net_pnl_dollars` | float | |
| `expectancy_dollars_ci` | `{point, low, high}` | seeded bootstrap |
| `expectancy_r_ci` | `{point, low, high}` | seeded bootstrap |
| `sign_test_p` | float | one-sided binomial |
| `monte_carlo` | object | the 015 `MonteCarloResult` (shuffle/cone/terminal/ruin/metadata) over pooled trades |
| `per_window_p` | `[{window_index, p_value, significant}]` \| absent | full mode only |
| `fisher` | `{x2, df, p}` \| absent | full mode only |
| `seed` | int | reproducibility echo |

**Invariants** (tested): determinism (same children+config → identical);
`windows_positive ≤ windows_with_trades ≤ windows_total`; full-mode result
contains every fast-mode key; gate refuses non-walk-forward / no-children /
<2 pooled trades.

## B. Migration `0123_insight_analyses.sql`

```sql
create table public.insight_analyses (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references auth.users(id),
    scope        text not null check (scope in ('study', 'insights')),
    scope_id     uuid,                       -- study_id when scope='study', else null
    payload_hash text not null,
    model        text not null,
    analysis     jsonb not null,             -- ClaudeAnalysis shape below
    created_at   timestamptz not null default now()
);
create index on public.insight_analyses (user_id, scope, scope_id, created_at desc);

create table public.insight_settings (
    user_id         uuid primary key references auth.users(id),
    claude_enabled  boolean not null default true,
    disabled_reason text check (disabled_reason in ('billing', 'manual')),
    updated_at      timestamptz not null default now()
);
-- + ENABLE ROW LEVEL SECURITY and the 0110-pattern policy pair on BOTH tables
```

## C. Pydantic response families (`models.py`, frozen)

- `CIStat {point, low, high}`
- `PooledGateResult` — mirrors §A (with `monte_carlo: MonteCarloResult`)
- `ClaudeFinding {claim: str, evidence_metric: str, confidence: Literal["low","medium","high"]}`
- `ClaudeExperiment {hypothesis: str, how_to_test: str}`
- `ClaudeAnalysis {summary: str, findings: list[ClaudeFinding], risks: list[str], suggested_experiments: list[ClaudeExperiment]}` — also the `output_format` schema passed to `messages.parse()`
- `StoredAnalysisView {id, scope, scope_id, payload_hash, model, analysis: ClaudeAnalysis, created_at, truncated: bool}`
- `InsightSettingsView {claude_enabled, disabled_reason, configured: bool}` — `configured` = env key present (computed, not stored)
- `EdgeTimeseriesPoint {run_id, study_id, window_index, config_name, range_start, range_end, trades, net_pnl, expectancy_dollars, expectancy_r, pnl_std}`
- `EdgeTimeseriesResponse {points: [...], snapshot_fingerprint}`
- `ConfigDistributionRow {config_name, windows, windows_positive, pnl_q25/q50/q75, expectancy_q25/q50/q75, total_trades}`
- `ConfigDistributionResponse {rows: [...], snapshot_fingerprint}`

## D. Config additions

```yaml
validation:
  pooled_gate:
    alpha: 0.05          # gate CI level = 1 - alpha
    seed: 20260605       # base; fixed offsets for $/R/MC draws
insights:
  claude:
    model: claude-opus-4-8
    max_tokens: 8000
    max_timeseries_windows: 200
```

(`InsightsClaudeConfig` + `InsightsConfig` nested under `Config.insights`;
`PooledGateConfig` under `ValidationConfig.pooled_gate`.)

## E. TS mirrors

`PooledGateResult`, `ClaudeAnalysis` family, `StoredAnalysisView`,
`InsightSettingsView`, `EdgeTimeseriesResponse`, `ConfigDistributionResponse`
in `frontend/src/api/types.ts`. `ValidationStudy.result` gains optional
`pooled_gate`.

## State transitions

- Gate: absent → fast → (optionally) full; recompute overwrites; never stale
  (children immutable per study).
- Settings: `enabled` ⇄ `paused(billing|manual)`; analyses immutable rows
  (newest-per-scope read path), no updates or deletes in v1.
