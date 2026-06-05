# Design: /runs shows every backtest

**Date:** 2026-06-05
**Branch:** `feat/runs-show-all-backtests`
**Status:** approved (brainstormed with user; direct TDD change, not a Spec Kit feature)

## Problem

The `/runs` (Backtests) page shows "No runs yet" even though the database
holds hundreds of backtests. Feature 014 added a `study_id IS NULL` filter
to the list endpoint (`storage/client.py`) to hide study child runs — but
since individual backtest creation was removed from the UI, *every* run is
now a study child (walk-forward IS/OOS windows, sensitivity grid points) or
a lockbox/CLI run, so the list is permanently empty.

Direction change: users will never create individual backtests again.
Backtests only come from validation studies and validation-created runs.
`/runs` should become the chronological index of every backtest performed.

## Decisions (from brainstorming)

1. **Show all runs** in `/runs`, sorted newest-first by `started_at`
   (already the cursor key — no ordering change needed).
2. **Origin badge per row** so hundreds of study children are
   distinguishable: study kind + segment + window, linking to the parent
   study.
3. **Remove the cloud-stack backtest-creation path** (UI dead code + the
   `POST /api/backtests` endpoint). The legacy local file-based viewer
   (`static_server.py`, `App.tsx`, `routes/root.tsx`, `routes/run-viewer.tsx`,
   `legacy-client.ts`) is unreachable dead code but is **out of scope** —
   deferred to a dedicated cleanup.
4. **Pagination stays as-is**: cursor-based, 20/page, React Query
   `useInfiniteQuery` + "Load more" — the same lazy-loading philosophy as
   `/runs/:id` (which loads trades/signals/journal/bars via separate
   on-demand endpoints).
5. **Study kind enrichment is server-side** (approach A): PostgREST FK
   embed in the list query, flattened to a nullable `study_kind` field.
   Rejected: client-side join (extra round-trips, badge flicker) and
   denormalizing `kind` onto `runs` (needless migration).

## Design

### 1. Backend — list endpoint

`backend/src/intraday_trade_spy/storage/client.py` (`list_runs`, ~line 578):

- Remove the `.is_("study_id", "null")` filter (feature 014 FR-008 is
  superseded by this change).
- Add FK embed: `.select("*, validation_studies(kind)")` — `runs.study_id`
  → `validation_studies.id` FK already exists (migration 0111).
- Flatten the embed into a nullable `study_kind` string
  (`'walk_forward' | 'sensitivity' | null`) on the returned row; drop the
  nested object before schema validation.

`backend/src/intraday_trade_spy/api/routers/runs.py` + schemas:

- Add `study_kind: str | None` to the run list item response model.
  `study_id`, `segment`, `window_index` are already returned.
- Cursor pagination (`started_at DESC, id`) unchanged.

### 2. Frontend — RunsList origin badges

`frontend/src/components/runs/RunsList.tsx` (+ row component):

- Add an **Origin** column. Per-row logic:
  - `study_id` set → badge `[<kind> · <segment> · w<window_index>]`,
    e.g. `walk-forward · OOS · w3`; window omitted when `window_index`
    is null (sensitivity points). Badge links to `/validation/{study_id}`.
  - `segment === 'lockbox'` (study_id null) → badge `[lockbox]`, no link.
  - neither → plain text `CLI run`, no link.
- Segment display follows the existing convention used by the study
  detail page (train → IS, validation → OOS, train_validation → IS+OOS).
- Update empty-state + HelpTooltip copy: runs come from validation
  studies; the list shows every evaluation ever performed (educational-UI
  principle).
- `useRuns` hook and "Load more" pagination unchanged; add `study_kind`
  to the TypeScript run type.

### 3. Removal — cloud backtest creation

Frontend (all currently unmounted dead code):
- `frontend/src/components/runs/StartBacktestDialog.tsx`
- `frontend/src/hooks/useStartBacktest.ts` + `useStartBacktest.test.ts`
- `frontend/src/api/backtests.ts`
- Fix `help-tooltip.feature-007-coverage.test.tsx` references.

Backend:
- `backend/src/intraday_trade_spy/api/routers/backtests.py`
  (`POST /api/backtests`) and its registration in `app.py`.
- `start_backtest` machinery in `api/lifecycle.py` — *only* the
  backtest-specific parts; the module is shared with the data router.
  Pre-verified: validation studies use `validation_lifecycle` (separate
  module) and CLI `--push-to-supabase` writes storage directly, so
  nothing else depends on it. Re-verify with grep before deleting.
- `StartBacktestRequest` / `StartBacktestResponse` schemas.
- `backend/tests/api/new/test_backtests.py`; update
  `test_cross_user_isolation.py` and `test_schemas.py` references.

Out of scope: legacy viewer stack, `intraday-trade-spy-server` console
command, `react-router` dependency.

### 4. Testing (TDD — tests first per constitution)

Backend:
- `list_runs` returns study children alongside standalone runs, ordered
  `started_at DESC`.
- Each child row carries `study_kind` from the FK embed; standalone rows
  have `study_kind = null`.
- Cursor pagination remains stable across pages with mixed run origins.
- `POST /api/backtests` no longer exists (404 / route absent from app).

Frontend:
- Badge rendering for each origin type (walk-forward child w/ window,
  sensitivity child w/o window, lockbox, CLI run).
- Badge links to `/validation/{study_id}` only for study children.
- Empty-state copy updated.
- Removed-file imports gone; suites green.

## Error handling

- A child run whose parent study row was deleted: FK embed returns null →
  `study_kind` null but `segment`/`window_index` still set → badge renders
  kind-less (`IS · w3`), no link. No crash.
- Runs with `status='failed'` render as today (status column), badge logic
  unaffected.

## Constitution check

- **TDD (P4):** all production changes test-first.
- **Educational UI (P6):** origin badge + updated HelpTooltip explain
  where runs come from.
- **Journal everything (P7):** untouched — read-path change only.
- No risk-manager, strategy, or data-layer changes. Zero migrations.
