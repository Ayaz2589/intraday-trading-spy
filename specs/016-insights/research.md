# Research — 016 Insights / Pooled Gate / Claude Narrative

Grounded against code on 2026-06-05 (branch `016-insights`, base `f8c8de2`).
Two findings **supersede the design doc**: R1 (migration number) and R2
(result-jsonb write semantics).

## R1 — Migration number: **0123** (design doc said 0120 — superseded)

Latest applied migration is `0122_workable_default_seed.sql`. The new
migration is `migrations/0123_insight_analyses.sql`, following the 0110 RLS
pattern exactly (per-table: ENABLE RLS + `*_user_isolation` policy for
`authenticated` on `user_id = auth.uid()` + `*_service_role_all` policy).
Applied to cloud via direct psycopg (`SUPABASE_DB_URL`), the established route.

## R2 — Gate persistence: read-modify-write on `validation_studies.result`

`storage.update_validation_study(..., result=dict)` **replaces the whole
jsonb** (client.py:1240) — there is no partial-merge method. Decision: the
gate flow does RMW — `get_validation_study()` → copy `result` → set/replace
`result["pooled_gate"]` → `update_validation_study(result=merged)`.

**Safety**: post-`finished`, the only writer of a study's result is the gate
flow itself (orchestrator writes once at completion; re-runs create new
studies), and full-gate concurrency is guarded per-study (R3). Single-operator,
single-process API — race risk is nil. No new storage method needed.

## R3 — Full-gate concurrency guard: in-process per-study set

There is no existing per-study guard (the 409s in validation are
`LargeStudyNotConfirmed`; `ConcurrentRunCapExceeded` guards backtest slots).
Decision: module-level `set[str]` of study-ids with an active full gate in
`validation_lifecycle.py`, new `PooledGateAlreadyRunning` exception → 409
envelope `{"error": "pooled_gate_running"}`. Adequate for the single-process
uvicorn deployment; documented limitation if the API ever scales out.

## R4 — Insights aggregates: storage-client methods on `db_pool`

Follow `bars_present_session_dates` / `bars_monthly_aggregate`
(client.py:949-1026, Feature 013): methods on `SupabaseStorageClient` using
`get_pool()` (reads `SUPABASE_DB_URL`; pool max from `api.db_pool_max_size`).

- `insights_edge_timeseries(user_id)` — one row per OOS child:
  join `runs` (study_id not null, segment='validation') × `trades` grouped by
  run: `count(t.pnl)`, `sum(t.pnl)`, `avg(t.pnl)`, `avg(t.r_multiple)`, plus
  run fields (range_start/end, window_index, study_id, id) and the study's
  `params->>'config_name'` via join to `validation_studies`. Sharpe from
  daily-grouped pnl is overkill for v1 — point sharpe comes from per-window
  trade pnls (`avg/stddev_samp` per run, annualization left to display) —
  computed in SQL with `stddev_samp(t.pnl)`.
- `insights_config_distribution(user_id)` — group the same per-window rows by
  config: `count(*)`, `count(*) filter (where win_pnl > 0)`,
  `percentile_cont(0.25/0.5/0.75)` over window pnl and window expectancy,
  `sum(trades)`.
- `snapshot_fingerprint` = sha256 over `(count, max(created_at), sum(trades))`
  of contributing runs — computed in the same query, cheap and
  deletion-sensitive.

**Testing** per the 013 pattern: mock `get_pool()`/cursor for unit contract;
SQL itself exercised against fixture rows where present, otherwise verified in
live e2e.

## R5 — Anthropic SDK usage (per claude-api guidance)

- Dependency: `anthropic>=0.40` in `backend/pyproject.toml`; key from
  `ANTHROPIC_API_KEY` env (backend/.env + container env); **never** shipped to
  the frontend.
- Client: module-level singleton `anthropic.Anthropic()` constructed lazily on
  first use; absence of the env var → "unconfigured" state (503 + UI hint).
- Call shape: `client.messages.parse(model=cfg.model, max_tokens=cfg.max_tokens,
  thinking={"type": "adaptive"}, system=[{type, text, cache_control:
  {"type": "ephemeral"}}], messages=[payload], output_format=ClaudeAnalysisSchema)`
  — `parse()` validates against the Pydantic schema and returns
  `parsed_output`; on schema mismatch it raises → 502.
- Error mapping: `anthropic.APIStatusError.type == "billing_error"` →
  auto-pause; `anthropic.AuthenticationError` → 503 setup hint (no pause);
  `anthropic.RateLimitError` / `anthropic.OverloadedError` (and
  `APIStatusError` ≥500) → transient message. SDK already retries
  429/5xx twice internally.
- Model default `claude-opus-4-8` via `insights.claude.model` config; output
  cap `insights.claude.max_tokens` (default 8000 — narrative + thinking).
- Note: Opus minimum cacheable prefix is 4096 tokens; if the methodology
  system prompt is shorter, the cache marker silently no-ops — accepted.

## R6 — Edge time-series chart: new hand-rolled SVG `line-scatter.tsx`

No reusable line/scatter exists (equity-curve is a single-series sparkline;
klinecharts is OHLC-only). Decision: small generic component — multiple
series, points clickable (callback w/ datum), value axis with zero-line,
hover title — reused by EdgeTimeseries and available to future views. No new
chart dependency.

## R7 — Pooled statistics: closed forms, no scipy

- Sign test: one-sided binomial tail `sum(C(n,k) for k in [w..n]) / 2^n`
  (math.comb). Worked example: 9/12 → 0.073242…
- Fisher: `X² = −2·Σ ln p_i`, df = 2k; survival via the integer-df series
  `e^{−x/2}·Σ_{n<k}(x/2)^n/n!` (validated tonight: X²=85, df=24 → 9.53e-9).
- Gate rule: `passed = bootstrap CI low (expectancy $) > 0` at
  `validation.pooled_gate.alpha` (default 0.05 → 95% CI via existing
  `bootstrap_ci(confidence=1−alpha)`); seeds: `pooled_gate.seed` base with
  fixed offsets for $/R/MC draws (the significance seed+k precedent).

## R8 — Pooled MC reuse

`run_monte_carlo(pnls, starting_equity, cfg=insights-tuned MonteCarloConfig?, …)`
— decision: reuse `validation.monte_carlo` config as-is (no second MC block);
starting equity parsed from the **first child's** `config_snapshot.risk.account_value`
(children of one study share a frozen config — asserted defensively; mismatch
→ 400 "study children carry inconsistent configs").

## R9 — Payload identity & truncation

Deterministic `json.dumps(payload, sort_keys=True, separators=(",", ":"))` →
sha256 → `payload_hash`. Insights payload embeds the `snapshot_fingerprint`s
of its inputs; study payload embeds the study id + gate `computed_at`.
Truncation: time-series capped at `insights.claude.max_timeseries_windows`
(default 200) most-recent windows; a `truncated: true` flag inside the payload
(and echoed in the stored analysis) keeps the disclosure honest.

## R10 — `insight_settings` bootstrap

Row created lazily: `get_insight_settings(user_id)` upserts the default
(`claude_enabled=true, disabled_reason=null`) on first read. PATCH updates
`claude_enabled` (+ clears or sets `disabled_reason='manual'`); the billing
handler sets (`false`, `'billing'`).

## R11 — Frontend integration points (verified)

- Nav: `side-nav.tsx:16-21` `NAV_ITEMS` — insert Insights entry (icon added to
  `nav-icons.tsx`); suggested position after Validation.
- Route: `routes/_authenticated.insights.tsx` via `createFileRoute`
  (TanStack file routes, tree auto-generated).
- Gate panel mount: `StudyDetailPage.tsx` between `StudyStatCards` and
  `WindowRows` (~line 52); full-gate progress reuses the `RerunAction`-style
  inline progress pattern (poll study row).
- Mutations get `retry: false` (deterministic 4xxs never heal — 015 lesson).
