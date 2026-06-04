# Data model — 013 data observability

**No database changes.** This feature is read-only over four existing tables
(`bars`, `backfill_jobs`, `runs`, `validation_studies`); everything below is a
view model (Pydantic response schema / TS type), not schema.

## View models

### CacheTotalsView

| Field | Type | Source |
|---|---|---|
| bars | int | `COUNT(*)` over `bars` |
| sessions | int | distinct ET session dates |
| earliest | date \| null | min session date |
| latest | date \| null | max session date |
| last_updated | datetime \| null | `MAX(bars.created_at)` (research D2) |
| sources | list[str] | distinct `bars.source` across the cache |

### MonthStatView

One per calendar month from the earliest cached month through the current
month (ET). Derived by the pure `month_stats` function (research D3).

| Field | Type | Notes |
|---|---|---|
| month | str `"YYYY-MM"` | ET bucketing |
| state | `complete \| partial \| current \| future` | rules in research D3 |
| sessions_present | int | distinct cached session dates in month |
| sessions_expected | int | NYSE calendar (holidays/half-days excluded); for the current month, sessions ≤ today only |
| bars | int | bar count in month |
| sources | list[str] | distinct sources in month (D6) |
| missing_dates | list[date] | expected − present; empty unless `partial` |

**Invariants**: `missing_dates` non-empty ⇔ `state == partial`;
`sessions_present ≤ sessions_expected` for non-future months; a `future` month
has zeros and no missing dates.

### LineageView

| Field | Type | Source |
|---|---|---|
| runs_count | int | PostgREST exact count over `runs` (persisted rows ⇒ matches Runs page, SC-007) |
| studies_count | int | exact count over `validation_studies` |
| latest_run_at | datetime \| null | max `runs.started_at` |

### BarsStatsResponse

`{ totals: CacheTotalsView, months: MonthStatView[], lineage: LineageView }` —
the single page snapshot served by `GET /api/bars/stats`.

### BackfillJobView (existing) + BackfillJobListResponse

`BackfillJobView` already exists for `GET /bars/backfill/{job_id}`; the list
response reuses it: `{ jobs: BackfillJobView[] }`, newest-first, limit =
`api.backfill.history_limit` (20). Fields displayed by the UI: `created_at`,
`updated_at` (→ duration), `status`, `source`, `range_start`, `range_end`,
`windows_done/windows_total`, `bars_added`, `failure_reason`. The job's
`gap_session_dates` remains available but is not rendered in v1 (the heatmap
answers "where are the holes" globally).

## Relationships

- `MonthStatView.missing_dates` ⊂ expected NYSE sessions for that month — the
  *only* place "missing" is defined; the heatmap and the "no missing sessions"
  banner both derive from it.
- `LineageView` is cache-global (no per-range join) — deep lineage is feature
  015's.

## Frontend types

`frontend/src/api/types.ts` gains mirrors: `CacheTotals`, `MonthStat`
(`state` union), `Lineage`, `BarsStatsResponse`, `BackfillJob`,
`BackfillJobListResponse` — matching the contract exactly.
