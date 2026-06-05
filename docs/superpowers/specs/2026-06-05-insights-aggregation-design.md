# Insights / aggregation + pooled study gate + Claude narrative — design

**Date:** 2026-06-05 · **Status:** approved (brainstorm) · **Feature:** 016-insights
**Prereqs:** 011 (validation engine), 014 (child runs — the archive), 015 (Monte Carlo engine)
**Origin:** the wf-rr3 gate run (2026-06-05) was executed ad-hoc via docker-exec + psycopg
because the decision-grade number — pooled-OOS significance — did not exist in the
product. This feature productizes it and builds the cross-run insights layer around it.

## Scope (decided)

**In v1:**
1. **Pooled study-level gate** — pooled-OOS significance + Monte Carlo over all
   validation windows of a walk-forward study, as the headline panel on study detail.
2. **Cross-run insights views** — edge time-series + per-config window distribution,
   on a new Insights page (new nav-rail item).
3. **Claude narrative analysis** — advisory LLM perspective on both surfaces
   (Insights page + study gate panel), via the Anthropic API.

**Deferred (recorded follow-ups):** soft-delete retention (+ re-enabling the
delete-all-runs button), rejection mining, sensitivity-across-archive.

**Approach:** on-demand aggregation + minimal persistence (approach A) — reuse the
existing engines (bootstrap, MC, study background-task lifecycle, 013's psycopg
aggregate path); persist exactly two things (gate verdicts, Claude analyses).

---

## 1. Pooled study gate (backend)

New pure module `validation/pooled.py`; orchestration in `api/validation_lifecycle.py`.

- `gather_pooled_oos(study_id)`: all `segment='validation'` children of a
  walk-forward study, trades concatenated in window (chronological) order.
  Pre-014 studies (no children) → 400 plain-English + the existing "re-run study"
  affordance. Sensitivity studies → 400 (walk-forward only). Pooled trades < 2 → 400.
- **Fast path (sync, ~2 s)** — `POST /api/validation/studies/{id}/pooled-gate?mode=fast`:
  - pooled bootstrap CIs on expectancy $ and R (existing `bootstrap_ci`, seeded)
  - pooled Monte Carlo (existing `run_monte_carlo`: shuffle drawdown stats, cone,
    ruin) over pooled OOS trades; starting equity from the children's (identical)
    config snapshot — same rule as 015 R3
  - sign test on window PnL signs (closed form)
  - **gate verdict: `passed = (pooled expectancy-$ CI low > 0)`** — the
    pre-registered rule that decided the wf-rr3 run
- **Full path (background task)** — `mode=full`: adds per-window permutation tests
  (existing `run_significance_for_run` per child, ~3 s each) + Fisher's combined p.
  Same background-task pattern as studies; 409 guard against concurrent runs.
- **Persistence, zero new tables**: completed gate written into
  `validation_studies.result` jsonb under an additive `pooled_gate` key
  (`computed_at`, verdict, CIs, MC summary, per-window p-values when full).
  A study's children never change (re-run = new study), so gate results cannot
  go stale by construction.
- Config: `validation.pooled_gate` block (alpha, seed offsets, mode defaults) —
  no magic numbers.
- Determinism: fully seeded → byte-identical recompute.

## 2. Insights aggregates (backend)

New router `api/routers/insights.py`; SQL via the direct-psycopg aggregate path
established in 013. Both endpoints scope to `runs.segment = 'validation'` only
(provably-OOS, same honesty rule as 015's caveat) and are user-scoped in SQL.

- **`GET /api/insights/edge-timeseries?config_name=`** — one point per OOS
  child run across the archive (all metrics in one response; the frontend picks
  which to plot): window range, config, expectancy $/R, sharpe,
  trades, net PnL, study_id/run_id/window_index. Metrics computed **from the
  trades table** (`avg(pnl)`, `sum(pnl)`), not from `summary` jsonb — sidesteps
  the open ~2× summary-expectancy discrepancy; same basis as the gate.
- **`GET /api/insights/config-distribution`** — per config: window count, share of
  positive windows, quartiles of window PnL/expectancy, total OOS trades.
- Every response carries a **`snapshot_fingerprint`** (hash over count + max
  created_at of contributing runs) — pins Claude analyses and tells the UI when
  data changed.
- No persistence; archive scale (hundreds of windows) needs no pagination.

## 3. Claude narrative (backend)

New module `api/claude_analyst.py`: gather payload → call Claude → validate → store.
New dependency **`anthropic`** (official SDK) + `ANTHROPIC_API_KEY` env var
(server-side only). Docker rebuild on merge.

- **Call**: model from config (`insights.claude.model`, default `claude-opus-4-8`),
  adaptive thinking, streaming internally with `get_final_message()`.
- **Structured output** via `client.messages.parse()` (Pydantic):
  - `summary` (markdown narrative)
  - `findings[] {claim, evidence_metric, confidence}` — every claim must name the
    payload metric backing it (no number laundering; UI renders the metric from
    OUR data beside the claim)
  - `risks[]`, `suggested_experiments[] {hypothesis, how_to_test}` — experiments
    for the operator, never trades
- **System prompt** (stable, `cache_control` marker): skeptical-analyst persona +
  app methodology glossary (walk-forward/lockbox/MC/significance as used here) +
  the advisory-only boundary ("challenge, don't cheerlead"). Note: Opus minimum
  cacheable prefix is 4096 tokens — below that the marker silently no-ops
  (acceptable; pennies at this volume).
- **Payloads**: study scope (gate result + per-window table + params) and insights
  scope (time-series + distribution + recent verdicts). Deterministic JSON
  (sorted keys) → `payload_hash` (sha256). Oversized payloads truncate the
  time-series to the most recent `insights.claude.max_timeseries_windows`
  windows (config, default 200), noted in payload and UI.
- **Persistence — migration 0120** (applied to cloud via direct psycopg):
  - `insight_analyses(id, user_id, scope ∈ {study, insights}, scope_id,
    payload_hash, model, analysis jsonb, created_at)` + RLS
  - `insight_settings(user_id pk, claude_enabled bool, disabled_reason text,
    updated_at)` + RLS
- **Endpoints**: `POST /api/insights/claude-analysis {scope, scope_id?, force?}` —
  idempotent by hash (same payload → return stored, no API call);
  `GET` latest per scope; `PATCH /api/insights/claude-settings {enabled}`.
- **Failure taxonomy**:

| Failure | Behavior |
|---|---|
| `billing_error` (credit exhausted) | **auto-pause**: `insight_settings.claude_enabled=false`, `disabled_reason='billing'`; UI banner "top up at console.anthropic.com → Plans & Billing" + one-click Re-enable (optimistic — a still-empty balance just re-trips the switch harmlessly) |
| `authentication_error` (bad/missing key) | 503 + setup hint; NOT auto-paused (config problem, not money) |
| `rate_limit_error` / `overloaded_error` | "try again shortly"; nothing persisted |
| structured-output parse failure | 502 "unparseable analysis — try again" |
| `refusal` stop reason | surfaced plainly |

- The switch doubles as a **manual pause toggle**. Stored analyses stay readable
  while paused. The whole feature degrades gracefully: every numeric view works
  with Claude off.
- **No journaling** (matches the significance/MC read-only-analytics precedent);
  the stored row is the record. Claude output is non-deterministic → stored once,
  labeled with model + snapshot hash + timestamp; regenerate only when the
  snapshot changed or `force`.
- **Cost model (operator)**: ≈ $0.10–0.25 per analysis at Opus 4.8 pricing
  ($5/$25 per MTok); $5 of credit ≈ 20–40 analyses; idempotency means paid calls
  only happen when data changes. Model is a config knob (`claude-sonnet-4-6`
  ≈ 40% cheaper) — default stays Opus.

## 4. UI

- **Insights page** — new nav-rail item (suggested position between Validation and
  Data; final order at e2e). **Layout A (chosen via visual companion): split** —
  charts left ⅔ (edge time-series with per-config series, each point click-through
  to its child run; config distribution comparison), **Claude's read as a sticky
  right panel**.
- **Pooled gate panel** — top of walk-forward study detail (above window rows):
  - verdict banner: "GATE: PASSED / NOT PASSED" + the rule spelled out
    ("pooled OOS expectancy 95% CI [−0.53, +2.56] includes zero") + lockbox tooltip
  - stat row: pooled trades, total OOS PnL, expectancy $/R CIs, windows positive
    (sign-test p)
  - pooled MC strip reusing 015's distribution-strip components
  - "Run full gate" → background progress in the study header (like re-run);
    completion adds per-window p-values to window rows + Fisher p to the banner
  - "🤖 Claude's read" beneath the verdict
- **ClaudeReadCard** (one component, both surfaces): header + advisory tooltip;
  markdown summary; findings table (claim | cited metric rendered FROM OUR DATA |
  confidence); risks; suggested experiments; footer
  `snapshot <hash> · <model> · <date>` + Regenerate (enabled only when snapshot
  changed, or force). Paused state = billing banner + Re-enable; unconfigured
  state = quiet setup hint.
- HelpTooltips for every new concept (pooled gate, sign test, Fisher combined,
  edge time-series, window distribution, Claude advisory, snapshot pinning).

## 5. Edge cases

- Zero-trade windows excluded from pooling but counted ("11 of 12 windows
  contributed trades").
- Empty archive → chart empty-states; Claude buttons disabled ("nothing to
  analyze yet").
- Concurrent full-gate 409; idempotent fast-path recompute.
- Determinism split is explicit in the UI: gate = seeded/reproducible; Claude =
  advisory/non-deterministic.

## 6. Testing (TDD)

- **Engine**: hand-computed pooling fixtures; gate-rule boundary (CI low exactly
  0); sign test (9/12 → p=0.0730) and Fisher (X²=85, df=24 → p≈9.5e-9) against
  tonight's worked examples; seeded determinism.
- **API**: fast 200 shape; 400s (sensitivity/no-children/<2 trades); full-mode
  202 + `result.pooled_gate` persisted (mocked storage); 409; insights aggregates
  against fixture rows per the 013 pattern.
- **Claude analyst** (SDK fully mocked, no network): payload-hash determinism;
  idempotent on unchanged hash; `force`; `billing_error` flips settings while
  `authentication_error` does not; parse-failure 502; cache marker present.
- **Frontend**: split layout from fixtures + empty states; gate banner both
  verdicts; ClaudeReadCard (findings table, paused/unconfigured,
  regenerate-disabled-on-same-hash); nav item; help-content census.
- **Live e2e (operator)**: pooled gate on the wf-rr3 study must reproduce the
  2026-06-05 ad-hoc verdict (**NOT PASSED**, expectancy $0.91, CI [−0.53, +2.56],
  2,607 trades); Claude read on both surfaces; pause/re-enable flow.

## Constitution touchpoints

- **II (rule-based, no ML)** — the LLM is strictly advisory and outside the
  trading loop: it reads computed statistics, cites them, and suggests
  experiments; it never generates signals, never tunes knobs, has no execution
  path. Strategy/risk/broker untouched. The gate itself is classical statistics.
- **III** — read-only over persisted runs.
- **IV** — TDD as §6; SDK mocked in tests.
- **VI** — tooltips for every new concept; the findings table is itself an
  educational device (claim vs. evidence).
- **VII** — no journal writes (read-only analytics precedent); `insight_analyses`
  rows are the durable record of what was generated from which snapshot.

## Out of scope (explicit)

- Soft-delete retention + delete-all re-enable (next natural follow-up)
- Rejection mining; sensitivity-across-archive
- Any automated parameter optimization from Claude output (Principle II)
- Claude in any background/scheduled path — manual button only
- Investigating the summary-vs-trades expectancy discrepancy (separate fix;
  insights deliberately computes from trades to avoid it)
