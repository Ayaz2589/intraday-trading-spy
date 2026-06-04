# Feature 014 — Study child-run persistence + drill-down (design)

**Date:** 2026-06-04 · **Status:** approved (brainstorm) · **Next:** feed the seed below to `/speckit-specify`
**Seed source:** [docs/research-tooling-uplift.md](../../research-tooling-uplift.md) §5 (written as "Feature 013" before the numbering shift)

## Problem

Validation studies (011) persist only their aggregated result. Each per-window /
per-grid-point evaluation runs in-memory (`engine.run_df`) and its `run_id` is a
placeholder UUID — so you cannot drill into a window's trades/journal/chart, and
significance cannot attach to a study window (the run 404s). The `runs` table
already has `study_id` / `segment` / `window_index` (migration 0111) but nothing
writes them. The lockbox ledger's `run_id` is likewise never written.

## Decisions made during brainstorming

1. **Fold the study-detail-page redesign into 014** (it was the deferred piece of
   the validation-page redesign; 014 touches that page anyway).
2. **Old (pre-014) studies:** leave their results as-is, hide drill-down links
   (placeholder run_ids), and ship a **"Re-run study" button** that clones a
   study's params into a fresh study — the general path to a drillable version.
3. **Significance:** reached via the child run's detail page (the panel already
   lives there). No new significance UI on the study page.
4. **Persistence approach: A — in-memory payload builder** (vs. temp-dir file
   round-trip, vs. batch-at-end). Per-eval push, mirroring the existing per-eval
   progress update; children appear incrementally and survive a mid-study crash.
5. **Windows-table treatment: Option B — expandable rows** (StudiesTable
   language): collapsed row = OOS verdict; expanded = IS/OOS detail pair, each
   with a "View run →" link.

## Design

### 1. Backend — child-run persistence

- **`storage/push.py` — `build_run_payload(...)` (new, shared):**
  `build_run_payload(result: BacktestResult, *, user_id, config_id, strategy_id,
  run_id, study_id=None, segment=None, window_index=None, config_snapshot=None)
  -> PushRunPayload`. The journal-row → `TradeRow`/`SignalRow`/`JournalEventRow`
  mapping is **extracted from `gather_run_outputs()`** so both paths share one
  mapper; `gather_run_outputs()` becomes file-reading + the shared builder.
  A **parity test** asserts in-memory payload ≡ file-round-trip payload for the
  same engine result.
- **Orchestrator hook (`validation/study.py`)** — inside each `evaluate()`
  closure, after `engine.run_df(slice_df)`:
  1. Compute `spec_hash` for the eval (strategy, effective params, SPY, slice
     range) via the existing `run_spec.compute_spec_hash`.
  2. **Dedup (SC-008):** if `find_finished_run_by_spec(spec_hash)` hits,
     reference the existing `run_id` — no new row. Identical evaluations across
     studies link, not duplicate. (A dedup-linked run keeps its own
     `study_id`/NULL — the new study references it only via its result JSON.)
  3. Otherwise build the payload with `study_id`/`segment`/`window_index` +
     `config_snapshot` (effective knobs for that eval — for sensitivity, base
     config merged with the grid-point overrides) and `client.push_run()` it;
     stamp `spec_hash`.
  4. The cloud `run_id` lands in `WindowMetrics.run_id` /
     `SensitivityPoint.run_id` (replacing today's placeholders), and both models
     gain an optional **`persisted: bool` (default `False`)** set `True` on a
     successful push (or dedup hit) — so the aggregated result JSON
     self-describes which children are drillable. Old studies (field absent)
     and failed pushes both read as not-drillable, with one mechanism.
- **Fail-soft:** a push failure logs, leaves that eval's `persisted=False`, and
  does NOT fail the study — every evaluation's math stays byte-identical to
  today (persistence is additive; constraint from the seed).
- **`run_df` already provides `data_fingerprint`** (content-based
  `fingerprint_df`) — no engine change.
- **Lockbox:** the one-shot eval persists the same way (`segment='lockbox'`)
  and `lockbox_ledger.run_id` is written, making the lockbox result drillable.
- **Write load:** per-eval pushes are sequential single RPCs, matching the
  existing per-eval progress UPDATE; tens-to-hundreds of evals is fine. No
  batching (Approach C rejected — loses incremental durability).

### 2. Backend — API, runs list, re-run

- **`list_runs()` filters `study_id IS NULL`** — the main runs list/sidebar
  shows only standalone runs. No toggle (YAGNI); children are reached through
  their study. Dedup nuance: a pre-existing standalone run referenced by a
  study stays visible (it is not a child).
- **`RunView` gains nullable `study_id` / `segment` / `window_index`.** The
  run-detail page shows a "Part of study — window N · segment" badge linking
  back to `/validation/$studyId`.
- **`POST /api/validation/studies/{study_id}/rerun`** — loads the old study's
  `kind` + `params` (embedding `config_name`) and calls the existing
  `start_study()`. Returns the new study id; the old study is untouched.
  Guards: 404 unknown study; existing config-missing error surfaces as-is.
- **Zero migrations.** Runs columns (0111), `lockbox_ledger.run_id` (0112), and
  `spec_hash` (0091) all exist; the filter is a WHERE clause; re-run is pure API.
- **No new child-runs endpoint** — the study result JSON carries `run_id` per
  window/point; the UI links straight to `/runs/$runId`. (Revisit in 015 if
  aggregation needs a listing.)

### 3. Frontend — study detail redesign + drill-down

- **Page frame (card language from the validation redesign):** header with kind
  + config name, params subtitle, status badge, **Re-run study** button;
  stat-cards row — walk-forward: mean OOS expectancy, IS→OOS gap, windows, OOS
  trades; sensitivity: metric, point count, best point.
- **Windows card (Option B):** expandable rows. Collapsed: window #, OOS
  expectancy, gap, trade count, low-confidence flag. Expanded: IS / OOS detail
  pair (range, expectancy, win rate, profit factor, net PnL), each with
  **View run →** to `/runs/$runId`.
- **Sensitivity card:** existing surface plot + a points table; each grid point
  links to its run.
- **Lockbox:** result links to its one-shot run.
- **Link gating:** a "View run →" link renders only when that window/point has
  `persisted: true` in the result JSON. Old (pre-014) studies lack the field →
  no links; a failed push in a new study → that one cell has no link; everything
  else is drillable. One rule, no per-cell existence checks.
- **Re-run button** also appears on StudiesTable rows (main validation page).
- **Tooltips (constitution VI):** `?` HelpTooltips for "child run", IS/OOS
  drill-down, and "re-run study".

## Error handling

- Child push failure → log + missing link; study continues (fail-soft).
- Re-run of a study whose config was deleted → existing config-not-found error.
- Run-detail back-link renders only when `study_id` is present.
- Study deletion cascades to children (`ON DELETE CASCADE`, already in 0111).

## Testing (TDD — constitution IV)

- **Parity test:** `build_run_payload` ≡ `gather_run_outputs` for one engine
  result (locks the refactor).
- **Orchestrator:** walk-forward and sensitivity studies persist N children with
  correct `study_id`/`segment`/`window_index` + real run_ids and
  `persisted: true` in the result; push failure → that eval `persisted: false`,
  study still finishes; progress unaffected.
- **Dedup:** identical eval reuses the existing run (no second row).
- **Lockbox:** ledger row gains `run_id`; child run persisted with
  `segment='lockbox'`.
- **API:** `list_runs` excludes children; `RunView` exposes study fields;
  re-run endpoint clones params and 404s on unknown study.
- **Frontend:** expandable window rows render links only for `persisted: true`
  cells; re-run button fires + navigates; back-link badge on run detail.
- **Aggregate-math regression:** study result (means/gaps) byte-identical with
  persistence on vs. off (stub storage).

## Out of scope

- Cross-run insights/aggregation + retention (Feature 015).
- Research/Learn UI lanes (016).
- Backfilling old studies' children automatically (Re-run is the path).
- Inline significance UI on the study page.

## Constitution touchpoints

I (SPY-only) / II (no re-optimization — re-run uses identical params) /
III (risk veto unchanged — same engine) / V (no live) unchanged; IV TDD as
above; VI tooltips for the new concepts; VII child runs + lockbox run journaled
exactly as standalone runs (same push path).
