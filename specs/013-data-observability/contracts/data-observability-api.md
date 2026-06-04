# API contract — 013 data observability

Both endpoints are authenticated (same `auth_user_id` gate as the rest of
`/api`), read-only, and live in `api/routers/bars.py`.

## GET /api/bars/stats

The whole-page snapshot. Best-effort like `/bars/coverage`: storage failures
inside subsections degrade (empty months / null totals fields) rather than 500.

**200 response** (`BarsStatsResponse`):

```json
{
  "totals": {
    "bars": 164919,
    "sessions": 2118,
    "earliest": "2018-01-02",
    "latest": "2026-06-04",
    "last_updated": "2026-06-04T15:02:11Z",
    "sources": ["alpaca", "yfinance"]
  },
  "months": [
    {
      "month": "2026-05",
      "state": "complete",
      "sessions_present": 20,
      "sessions_expected": 20,
      "bars": 1560,
      "sources": ["alpaca"],
      "missing_dates": []
    },
    {
      "month": "2026-06",
      "state": "current",
      "sessions_present": 3,
      "sessions_expected": 3,
      "bars": 234,
      "sources": ["alpaca"],
      "missing_dates": []
    }
  ],
  "lineage": {
    "runs_count": 47,
    "studies_count": 14,
    "latest_run_at": "2026-06-04T14:11:09Z"
  }
}
```

- `months` spans the earliest cached month → current ET month, inclusive,
  ascending. Empty cache ⇒ `months: []`, `totals.bars: 0`, null dates.
- `state` ∈ `complete | partial | current | future`; `missing_dates` non-empty
  iff `partial` (see data-model invariants).

## GET /api/bars/backfill

Job history, newest first.

**Query**: none (limit comes from `api.backfill.history_limit`, default 20).

**200 response** (`BackfillJobListResponse`):

```json
{
  "jobs": [
    {
      "id": "…",
      "status": "finished",
      "source": "alpaca",
      "range_start": "2018-01-01",
      "range_end": "2026-06-04",
      "windows_total": 103,
      "windows_done": 103,
      "bars_added": 1,
      "failure_reason": null,
      "created_at": "2026-06-04T14:46:02Z",
      "updated_at": "2026-06-04T14:46:50Z"
    },
    {
      "id": "…",
      "status": "failed",
      "failure_reason": "No module named 'alpaca'",
      "windows_total": 103,
      "windows_done": 0,
      "bars_added": 0,
      "range_start": "2018-01-01",
      "range_end": "2026-06-04",
      "source": "alpaca",
      "created_at": "2026-06-04T14:31:10Z",
      "updated_at": "2026-06-04T14:31:11Z"
    }
  ]
}
```

- Reuses the existing `BackfillJobView` field set (single-job GET); the UI
  derives duration = `updated_at − created_at` for terminal jobs.
- Existing routes are untouched: `POST /bars/backfill` (start) and
  `GET /bars/backfill/{job_id}` (single-job polling) keep their contracts.
  The new list route must not shadow the `{job_id}` route (distinct path).

## Errors

| Case | Behavior |
|---|---|
| Unauthenticated | 401 (standard gate) |
| Storage unreachable (stats) | degrade per-subsection; never 500 the snapshot |
| Storage unreachable (jobs) | 503 with standard error body; frontend shows section-scoped message |
