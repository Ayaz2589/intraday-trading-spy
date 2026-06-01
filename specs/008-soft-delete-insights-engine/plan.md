# Feature 008 — Soft-Delete + Insights Engine Foundation

**Status:** planned (not yet implemented)

## Motivation

Today, deleting a backtest is a hard delete: the `runs` row plus all
`trades`, `signals`, `journal_events` rows for that run go via FK
`ON DELETE CASCADE`. That's user-friendly for hygiene but throws away
analytics-grade data forever.

We want to build an **insights engine** on top of this user's complete
historical backtest archive — cross-config comparisons, parameter
sensitivity analysis, per-strategy time-series, etc. That requires
keeping every run we've ever produced, even ones the user has
"deleted" from the sidebar.

This feature switches from hard delete to soft delete: the UI keeps
working exactly as it does today (deleted runs vanish), but on the
server side the rows persist behind a `deleted_at` filter, available
to internal analytics queries and a future restore / trash UI.

## Constitution check

- I (SPY only) — unchanged.
- II (long-only, rule-based) — unchanged.
- III (Risk manager veto) — unchanged.
- IV (TDD) — every storage filter change gets a unit test before the
  filter is added.
- V (paper-first) — unchanged.
- VI (Educational UI) — soft delete is invisible from the UI side, so
  no new help-tooltip surface area. If we later expose a Trash view,
  add a tooltip explaining "deleted runs are kept for the insights
  engine but hidden here."
- VII (Journal everything) — `deleted_at` *is* a journal-event-worthy
  state change. We'll emit a `journal_events` row of kind `lifecycle`
  with details `{event: "run_soft_deleted"}` when a run is soft-deleted.

No principles violated.

## Schema change

```sql
-- backend/db/migrations/0100_runs_soft_delete.sql

ALTER TABLE public.runs
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- Replace the existing active-runs index with a partial-index version
-- so the sidebar list query stays fast as deleted_at rows accumulate.
DROP INDEX IF EXISTS runs_user_started_idx;
CREATE INDEX IF NOT EXISTS runs_user_started_active_idx
    ON public.runs (user_id, started_at DESC)
    WHERE deleted_at IS NULL;

-- Separate index for the insights engine — covers all rows including
-- soft-deleted ones, ordered by started_at so time-series queries scan
-- in order.
CREATE INDEX IF NOT EXISTS runs_user_started_all_idx
    ON public.runs (user_id, started_at DESC);
```

No changes to `trades`, `signals`, `journal_events` — they stay
parented by the (still-present) run row, so no cascade fires. The
insights engine treats `deleted_at IS NOT NULL` as "archived; show in
aggregates, hide from list endpoints."

## Backend changes

### `storage/client.py`

| Method | Behavior change |
|---|---|
| `delete_run(run_id, user_id)` | `UPDATE runs SET deleted_at = now() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL` (instead of `DELETE`) |
| `delete_all_runs(user_id)` | `UPDATE runs SET deleted_at = now() WHERE user_id = $1 AND deleted_at IS NULL` (instead of bulk delete) |
| `list_runs(user_id, …)` | Add `.is_("deleted_at", "null")` to the query |
| `get_run(run_id, user_id)` | Add `.is_("deleted_at", "null")` |
| `update_run_favorite(…)` | Add `.is_("deleted_at", "null")` so deleted runs can't be re-favorited |
| `update_run_status(…)` | (lifecycle path) Leave alone — finalize must work even if the row was soft-deleted between queue + finish (edge case but cheap to keep open) |
| `list_trades / list_signals / list_journal` | Add an `is_("deleted_at", "null")` on the parent-run check, OR keep open and let the API layer's `get_run` ownership probe gate access. Easier to leave child-row queries unfiltered since the parent-existence check already runs. |

### New storage method (for insights / restore)

```python
def list_all_runs_including_deleted(self, *, user_id, limit, cursor):
    """Insights-engine read path. Does NOT filter deleted_at."""
```

### API surface

No changes to existing endpoints — their behavior is identical from
the client's view. New endpoints for the insights engine + future
restore UI:

- `GET /api/runs?include_deleted=true` — admin-only flag; same list
  endpoint but skips the `deleted_at IS NULL` filter. Behind a feature
  flag header `X-Include-Deleted: 1` so it's not stumbled-into by the
  normal frontend.
- `POST /api/runs/{id}/restore` — `UPDATE runs SET deleted_at = NULL`.
  Returns the restored `RunView`. 404 if no such run, 409 if the run
  is not currently deleted (idempotent: just return it).

### Test coverage (TDD)

For each storage filter change:
1. Test that a deleted run is invisible to `list_runs`.
2. Test that a deleted run returns 404 from `GET /api/runs/{id}`.
3. Test that `delete_run` is idempotent — calling twice doesn't error.
4. Test that the underlying row still exists (no actual `DELETE`).
5. Test that child queries still return their data when the parent is
   present — soft delete shouldn't break the in-flight backtest case.
6. Test the restore endpoint round-trip.

## Frontend changes

- **Zero changes to today's UI behavior.** Delete + delete-all + sidebar
  rendering work exactly the same — the optimistic cache update in
  `useDeleteRun` / `useDeleteAllRuns` / `useToggleFavorite` (in
  `hooks/useDeleteRun.ts`) is unchanged; the server now soft-deletes
  but the optimistic snapshot removal from the cache makes that
  difference invisible.
- **(Optional, later)** A "Trash" view at `/runs/archived` that calls
  `GET /api/runs?include_deleted=true` and lets the user restore via
  the new endpoint. Not part of MVP.

## Insights engine foundation

The actual insights engine is out of scope for this feature — this
plan only builds the foundation (preserved data + clean query path).
The engine itself will live in Feature 009.

Suggested read paths for that future feature:

1. **Per-config performance distribution** — for each `config_id` /
   `params` fingerprint, aggregate the `summary` JSONB across runs.
   Surface "this config has been backtested N times; median win-rate
   X%, median total R Y."
2. **Parameter sensitivity** — bucket runs by knob value (e.g. R:R
   = 1.5 / 2.0 / 2.5), compare summaries across buckets. Identify the
   sweet spot for each knob.
3. **Time-series of strategy edge** — for a fixed config, plot total
   R over `started_at`. Detect drift (the strategy was working in May,
   stopped in July).
4. **Cross-strategy comparison** — same date range backtested under
   two strategy keys, side-by-side R distributions. Lets the user
   pick a winner empirically.
5. **Rejection mining** — across all runs, which rejection reasons
   correlate with the user later changing knobs to make them go away?
   Helps surface "the cap is biting you on 60% of signals — maybe
   raise it."

All of these queries are read-only over the full archive. None require
re-running the engine.

## Out of scope (this feature)

- Hard delete / "Right to Erasure" for GDPR/CCPA — needed when going
  multi-tenant, not now. When we add it, the path is: a separate
  endpoint that does the actual `DELETE FROM runs` plus emits an audit
  journal entry.
- Trash view / restore UI — endpoint exists, frontend doesn't yet.
- Cron-based hard delete of very old soft-deleted rows (`deleted_at <
  now() - interval '5 years'`) — not needed at solo-user volume.
- The actual insights engine — separate feature.

## Migration / deployment

1. Apply `0100_runs_soft_delete.sql` to Supabase (`supabase db push --linked`).
2. Deploy backend with updated storage methods.
3. No frontend deploy required.
4. Existing rows: `deleted_at` is `NULL` → all visible. No backfill needed.
5. Existing already-deleted-via-API rows are gone; this feature only
   affects deletes going forward.

## Estimated effort

~1 hour: migration + 6 storage method tweaks + 1 new endpoint + tests.
Frontend untouched.

## Open questions

- Should `delete_all_runs` also soft-delete the configs/strategies the
  user customized but never used? Probably not — those have intrinsic
  value as reusable presets.
- Should the insights engine be a SQL view or computed in the API
  layer? Lean toward view: `CREATE VIEW analytics_runs AS SELECT ...
  FROM runs WHERE deleted_at IS NULL OR include_archived = true`.
  Defer the call until Feature 009.
