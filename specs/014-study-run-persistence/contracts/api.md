# API Contracts — Study Child-Run Persistence + Drill-Down

Base path `/api`. Auth: existing Supabase JWT (unchanged). Only deltas are
listed; all other endpoints are untouched.

## NEW — `POST /api/validation/studies/{study_id}/rerun`

Clone an existing study's `kind` + `params` (including `config_name`) into a
brand-new study. The original study row is never modified.

**Request**: no body.

**Response `202 Accepted`** (`StudyRerunResponse`):

```json
{
  "study_id": "9f4e1c2a-…",
  "planned_evaluations": 16
}
```

**Errors**

| Status | Condition | Body shape |
|---|---|---|
| 404 | unknown `study_id` (or not owned by caller — RLS) | existing error envelope, `detail: "study not found"` |
| 404 | study's `config_name` no longer exists | existing `StudyConfigNotFound` mapping (same as POST /studies) |
| 409 | existing study-concurrency guard (if at cap) | unchanged from POST /studies |

**Semantics**

- Internally calls the existing `start_study()` with the stored `kind`,
  `config_name`, and `params`, with `confirm_large=True` (the operator is
  explicitly re-running something that already ran once).
- The new study persists child runs (post-014 behavior) regardless of the
  original's vintage.

## CHANGED — `GET /api/runs` (list)

- **Filter**: response now excludes child runs (`study_id IS NOT NULL` rows).
  Standalone runs — including runs a study merely referenced via dedup — are
  unaffected. No query parameter to include children (reached via their study).
- **Pagination/order**: unchanged (`started_at DESC, id DESC` cursor).

## CHANGED — `RunView` (returned by `GET /api/runs`, `GET /api/runs/{run_id}`)

Three new nullable fields:

```json
{
  "id": "…",
  "…": "existing fields unchanged",
  "study_id": "b71d…-… | null",
  "segment": "train | validation | lockbox | null",
  "window_index": 3
}
```

- Standalone runs: all three `null`.
- The run-detail frontend renders a "Part of study — window N · segment" badge
  linking to `/validation/$studyId` when `study_id` is non-null.

## CHANGED — `validation_studies.result` payload shape (returned inside `ValidationStudyView.result`)

`WindowMetrics` and `SensitivityPoint` entries gain:

```json
{ "run_id": "…", "persisted": true }
```

- `persisted: true` ⇒ `run_id` refers to a stored, drillable run (successful
  push or dedup reference).
- Key absent (pre-014 results) or `false` (failed push) ⇒ the UI must not
  render a run link for that window/point.

## CHANGED — `GET /api/validation/lockbox` (status view)

The ledger entry now includes its `run_id` when the post-014 one-shot has run
(pre-014 entries keep `null`). Frontend renders a run link only when non-null.
No shape change beyond the populated value.

## UNCHANGED (explicitly)

- `POST /api/validation/studies` (start study), study list/get/status, the
  significance endpoint, and the `push_run(jsonb)` / `push_run_finalize`
  storage RPCs: same signatures, same shapes. Child runs flow through the
  existing RPC with `study_id`/`segment`/`window_index` simply populated.
