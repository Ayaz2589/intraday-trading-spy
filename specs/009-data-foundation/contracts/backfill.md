# Contract — Backfill endpoints

All endpoints require auth (Bearer token; `auth_user_id` dependency). Bars are a shared cache; jobs are user-scoped for RLS. Errors use the existing `{ "error": "...", "message": "..." }` detail shape.

---

## POST `/api/bars/backfill`

Start an in-app background bulk backfill. Returns immediately with a job id (FR-004, FR-004a).

**Request**
```json
{
  "start": "2018-01-01",      // date, required
  "end": "2026-06-01",        // date, inclusive, required
  "source": "alpaca"          // optional, default "alpaca"
}
```
Validation: `start <= end`; neither in the future; `source` ∈ configured sources. SPY-only (no `symbol` field accepted — constitution I).

**Response 202**
```json
{ "job_id": "uuid", "status": "queued" }
```

**Errors**
- `400 {"error":"end_before_start"}` — `end < start`
- `400 {"error":"future_date"}` — date in the future
- `429 {"error":"backfill_in_progress","active":N,"cap":M}` — user already at `api.backfill.max_concurrent_per_user` (matches the codebase's existing cap convention, e.g. `raise_download_cap`)
- long-fetch failures land on the job row (`status="failed"`, `failure_reason`), not on this response

**Behavior**: inserts a `backfill_jobs` row (`queued`), enqueues a `BackgroundTasks` runner, returns. Runner loops `api.backfill.window_days` windows, upserts via `upsert_bars` (`ON CONFLICT DO NOTHING` → idempotent/resumable), updates progress, ends `finished`/`failed`.

---

## GET `/api/bars/backfill/{job_id}`

Poll a backfill job's status/progress (frontend polls until terminal).

**Response 200**
```json
{
  "job_id": "uuid",
  "status": "running",
  "source": "alpaca",
  "range_start": "2018-01-01",
  "range_end": "2026-06-01",
  "windows_total": 102,
  "windows_done": 37,
  "bars_added": 184320,
  "gap_session_dates": ["2018-07-03"],
  "failure_reason": null
}
```

**Errors**
- `404 {"error":"job_not_found"}` — unknown id or not owned by caller (RLS)

---

## GET `/api/bars/backfill` *(optional — recent jobs)*

List the caller's recent backfill jobs (most recent first), for an at-a-glance history. Same item shape as the status response. Include only if cheap; otherwise defer.

---

## Contract tests (TDD — backend, `unit_client` + `stub_storage_client`)

- `POST /bars/backfill` happy path → 202 + `{job_id, status:"queued"}`; storage insert called once.
- `end < start` → 400 `end_before_start`; no job inserted.
- future date → 400 `future_date`.
- at concurrency cap → 409 `backfill_in_progress` (stub `count_active_backfills` returns the cap).
- `GET /bars/backfill/{id}` known → 200 with progress fields; unknown → 404 `job_not_found`.
- runner idempotency (unit, not endpoint): re-running a window where `upsert_bars` returns 0 leaves `bars_added` unchanged.
- **Principle V guard**: a test asserts the backfill path constructs only Alpaca's *historical data* client and never a trading/order client.
