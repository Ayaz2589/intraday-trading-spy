# Phase 1 Data Model — Authenticated HTTP Backend for Backtests

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

This feature is API-shaped — it does not introduce new business entities. The data model changes are minimal:

1. Extend `runs` with a `status` column for the lifecycle state machine (research §3).
2. Extend the `journal_events.kind` CHECK list with API-lifecycle values (research §4).
3. Add a small `data_download_jobs` table for the async historical-data fetch (research §11).

No new core entities. No changes to RLS policies beyond what already exists for `runs` and `journal_events` (the new column and rows inherit Feature 005's user-scoped policies automatically).

## 1. `runs.status` column (extension)

Add a status column to Feature 005's `runs` table. State machine:

```
queued ──────────► running ──────────► finished
   │                  │
   │                  └─────────────► failed
   │
   └──────────────────────────────► failed
       (cap exceeded, validation, etc.)
```

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `status` | `TEXT` | `NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','finished','failed'))` | NEW |
| `status_updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | NEW. Updated on each transition; used by the startup-sweep to find stale `running` rows. |
| `failure_reason` | `TEXT` | `NULL` | NEW. Populated when `status = 'failed'`. Free-text actionable message. |

**Migration**: `0051_runs_status.sql`. Idempotent (`ADD COLUMN IF NOT EXISTS`). Backfills existing rows with `status = 'finished'` (Feature 005's CLI push path only writes completed runs).

**State transition rules** (enforced in `intraday_trade_spy.api.lifecycle`):
- `queued → running` — when the BackgroundTask actually starts executing. UPDATE statement.
- `queued → failed` — when validation fails after the row is inserted but before the task starts (rare; we validate before insert in v1). UPDATE statement.
- `running → finished` — **atomic single-transaction write** via the new `push_run_finalize(jsonb)` RPC (research §3, clarification Q1). The RPC inserts trades/signals/journal_events AND updates `runs.status='finished'` in one transaction. There is NO separate UPDATE after data writes — the inconsistency window from process crash between writes and status flip is eliminated by construction.
- `running → failed` — engine crash, validation error, etc. UPDATE statement (failure path has no data to write).
- `running → failed` (sweep) — startup-time reconciliation transitions any `running` row older than `polling_status_max_age_minutes` to `failed`. UPDATE statement, idempotent.

No `failed → running` or `finished → *` transitions are allowed (enforced by app-level checks in `lifecycle.py`; the `push_run_finalize` RPC also rejects payloads whose target run is not in `status='running'`).

## 2. `journal_events.kind` CHECK list (extension)

Feature 005's `0006_journal_events.sql` allowed: `force_flat`, `risk_decision`, `error`, `lifecycle`, `cloud_push_success`, `cloud_push_failure`, `other`.

Extend the CHECK list with API-lifecycle kinds:

| New kind | Emitted by | Meaning |
|---|---|---|
| `api_request_received` | All protected routers, on entry | Audit log: "user X hit endpoint Y at time Z" |
| `backtest_started` | `lifecycle.start_backtest` | A backtest job has been enqueued |
| `backtest_finished` | `lifecycle.complete_backtest` | A backtest job has succeeded |
| `backtest_failed` | `lifecycle.fail_backtest` | A backtest job has failed |
| `data_download_started` | `data.start_download` | A yfinance fetch has been enqueued |
| `data_download_finished` | `data.complete_download` | A yfinance fetch has succeeded |
| `auth_failure` | `auth_user_id` dependency | A request was rejected for bad auth (audit) |

**Migration**: `0050_journal_event_kinds.sql`. Uses `ALTER TABLE … DROP CONSTRAINT IF EXISTS journal_events_kind_check; ALTER TABLE … ADD CONSTRAINT journal_events_kind_check CHECK (…)` with the expanded list.

## 3. `data_download_jobs` (new table)

A small bookkeeping table for the async historical-data download endpoint. Mirrors the runs table's lifecycle.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `user_id` | `UUID` | `NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` | |
| `start_date` | `DATE` | `NOT NULL` | |
| `end_date` | `DATE` | `NOT NULL CHECK (end_date >= start_date)` | |
| `status` | `TEXT` | `NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','finished','failed'))` | |
| `storage_path` | `TEXT` | `NULL` | The Supabase Storage path of the resulting CSV, populated on `finished`. Format: `{user_id}/spy_5m_{start}_{end}.csv`. |
| `status_updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | |
| `failure_reason` | `TEXT` | `NULL` | |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | |

**Indexes**: PRIMARY KEY on `id`; INDEX on `(user_id, created_at DESC)`.

**RLS policies** (same shape as Feature 005's user-scoped tables):
- `(user_id = auth.uid())` for authenticated users
- service-role bypass

**Migration**: `0060_data_download_jobs.sql`.

## 4. Pydantic API schemas (NOT persisted)

Located in `backend/src/intraday_trade_spy/api/schemas.py`. These are request/response models, distinct from `storage.models` (the DB-row models from Feature 005).

| Schema | Used by | Notes |
|---|---|---|
| `StartBacktestRequest` | `POST /api/backtests` body | `{config_name: str, data_csv_path: Optional[str]}` |
| `StartBacktestResponse` | `POST /api/backtests` response | `{run_id: UUID, status: "queued"}` (returns 202) |
| `RunSummaryResponse` | `GET /api/runs/{id}` | Maps `storage.models.RunRow` + `RunSummary` for the wire |
| `RunListResponse` | `GET /api/runs` | `{runs: list[RunSummary], next_cursor: Optional[str]}` (paginated) |
| `RunStatusResponse` | `GET /api/runs/{id}/status` | `{status: Literal["queued","running","finished","failed"], status_updated_at: datetime, failure_reason: Optional[str]}` |
| `TradeListResponse` | `GET /api/runs/{id}/trades` | `{trades: list[TradeView]}` |
| `SignalListResponse` | `GET /api/runs/{id}/signals` | `{signals: list[SignalView]}` |
| `JournalListResponse` | `GET /api/runs/{id}/journal` | `{events: list[JournalEventView]}` |
| `StartDataDownloadRequest` | `POST /api/data/download` body | `{start_date: date, end_date: date}` |
| `StartDataDownloadResponse` | `POST /api/data/download` response | `{job_id: UUID, status: "queued"}` (returns 202) |
| `StrategyListResponse` | `GET /api/strategies` | `{strategies: list[StrategyView]}` |
| `HealthResponse` | `GET /healthz` | `{status: "ok", db: "ok"|"unreachable"}` |

The `*View` types are read-only projections of `storage.models.*Row` types — they may omit internal fields (e.g., raw fingerprints) and rename for clarity.

## 5. Migration files (this feature)

| File | Purpose |
|---|---|
| `0050_journal_event_kinds.sql` | Extends `journal_events.kind` CHECK list (research §4) |
| `0051_runs_status.sql` | Adds `runs.status`, `status_updated_at`, `failure_reason` columns |
| `0052_push_run_finalize.sql` | Adds `push_run_finalize(jsonb)` Postgres function — atomic data write + status update (clarification Q1) |
| `0060_data_download_jobs.sql` | Creates `data_download_jobs` table + RLS + indexes |

All idempotent. Applied via `supabase db push` from `backend/`.

### `push_run_finalize(jsonb)` (NEW Postgres function)

Extends Feature 005's `push_run(jsonb)` to also flip `runs.status` to `finished` inside the same transaction (clarification Q1). Pseudocode shape:

```sql
CREATE OR REPLACE FUNCTION public.push_run_finalize(payload jsonb)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    run_uuid    UUID := (payload->'run'->>'id')::UUID;
    payload_uid UUID := (payload->'run'->>'user_id')::UUID;
    caller_uid  UUID;
    current_status TEXT;
BEGIN
    -- Same caller-validation as push_run
    IF auth.role() = 'service_role' THEN
        caller_uid := payload_uid;
    ELSE
        caller_uid := auth.uid();
        IF caller_uid IS NULL OR caller_uid <> payload_uid THEN
            RAISE EXCEPTION 'push_run_finalize: caller user_id mismatch';
        END IF;
    END IF;

    -- Reject if the run is not currently in 'running' state
    SELECT status INTO current_status FROM public.runs WHERE id = run_uuid;
    IF current_status IS NULL THEN
        RAISE EXCEPTION 'push_run_finalize: run % not found', run_uuid;
    END IF;
    IF current_status <> 'running' THEN
        RAISE EXCEPTION 'push_run_finalize: run % is in status %, expected running', run_uuid, current_status;
    END IF;

    -- Insert dependent rows (same as push_run)
    IF jsonb_array_length(COALESCE(payload->'trades', '[]'::jsonb)) > 0 THEN
        INSERT INTO public.trades
        SELECT * FROM jsonb_populate_recordset(NULL::public.trades, payload->'trades');
    END IF;
    IF jsonb_array_length(COALESCE(payload->'signals', '[]'::jsonb)) > 0 THEN
        INSERT INTO public.signals
        SELECT * FROM jsonb_populate_recordset(NULL::public.signals, payload->'signals');
    END IF;
    IF jsonb_array_length(COALESCE(payload->'journal_events', '[]'::jsonb)) > 0 THEN
        INSERT INTO public.journal_events
        SELECT * FROM jsonb_populate_recordset(NULL::public.journal_events, payload->'journal_events');
    END IF;

    -- Flip status to finished in the SAME transaction
    UPDATE public.runs
       SET status = 'finished',
           status_updated_at = now(),
           summary = COALESCE(payload->'run'->'summary', summary)
     WHERE id = run_uuid;

    RETURN run_uuid;
END;
$$;
```

Note: this function is invoked by the FastAPI BackgroundTask on successful engine completion. Failures inside the function roll the entire transaction back — no half-written state, no inconsistent status.

The original `push_run(jsonb)` from Feature 005 stays as-is (used by the CLI push path which writes complete runs that bypass the queued→running lifecycle).

## 6. Data retention (declared, not enforced)

Per clarification 2026-05-30 / Q5 and FR-019: the following retention policy is DECLARED in `backend/config/config.yaml` but NOT enforced in this feature. A later feature (or a Supabase `pg_cron` job declared in Feature 008's deploy) implements the actual pruning.

| Row class | Retention | Eligibility filter |
|---|---|---|
| `runs` where `status = 'failed'` | 90 days | `status = 'failed' AND status_updated_at < now() - interval '90 days'` |
| `journal_events` where `kind = 'api_request_received'` | 30 days | `kind = 'api_request_received' AND occurred_at < now() - interval '30 days'` |
| `data_download_jobs` where `status = 'failed'` | 30 days | `status = 'failed' AND status_updated_at < now() - interval '30 days'` |
| `runs` where `status = 'finished'` | INDEFINITE | (not pruned — these are the user's research history) |
| `journal_events` (any kind other than `api_request_received`) | INDEFINITE | (not pruned — trade-lifecycle audit trail per constitution VII) |
| `trades`, `signals` | INDEFINITE | (anchored to their `runs` row; cascade-deletes via FK when a `runs` row is pruned) |

The configuration values live in `config.yaml`:

```yaml
retention:
  failed_runs_days: 90
  audit_events_days: 30
  failed_downloads_days: 30
```

This feature's scope is limited to writing the policy declaration. No code in Feature 006 reads these values — they're written for a future enforcement job to pick up.

## 6. State diagrams

### Run lifecycle

```
                  POST /api/backtests
                          │
                          ▼
                  ┌──────────────┐
            ┌─────│   queued     │
            │     └──────┬───────┘
            │            │ BackgroundTask picks up
            │            ▼
            │     ┌──────────────┐
            │     │   running    │
            │     └──┬────────┬──┘
            │        │        │
   validation/cap   │       engine error / push failure
   (rare; v1 we    │        │
    check before   ▼        ▼
    insert)   ┌──────────────────┐
            └─►│     failed      │
               └─────────────────┘
                        ▲
                        │ startup sweep
                        │
                  ┌──────────────┐
                  │ stale running│
                  └──────────────┘

   ┌──────────────┐
   │  finished    │◄── push_run() succeeded
   └──────────────┘
```

### Data download lifecycle

Identical shape to the run lifecycle. `data_download_jobs.status` follows the same `queued → running → finished | failed` transitions.

## 7. Validation rules cross-referenced to spec

| Spec FR | Schema enforcement |
|---|---|
| FR-001 (auth required) | `auth_user_id` FastAPI dependency on every protected router |
| FR-002 (user-scope) | RLS from Feature 005 + app-level `user_id = auth_user_id` checks in routers |
| FR-003 (immediate response) | `POST /api/backtests` inserts row + enqueues BackgroundTask, returns 202 with `run_id`. SC-003 (<1s) verified in tests. |
| FR-005 (status enum) | `runs.status CHECK IN ('queued','running','finished','failed')` |
| FR-008 (async download) | `data_download_jobs` table mirrors run lifecycle |
| FR-009 (preserve legacy) | `static_server.py` mounted at `/legacy/` prefix; existing tests stay green |
| FR-011 (failed status, no half-write) | `push_run(jsonb)` is atomic; on any failure the run row is UPDATEd to `failed` and trades/signals/events are NOT written |
| FR-012 (audit log) | `journal_events.kind` extended with `api_*` and `backtest_*` values |
| FR-014 (service-role never accepted) | `auth_user_id` only accepts JWTs whose `aud` claim is `authenticated`; service-role JWTs use `aud = service_role` and are rejected |
| FR-015 (no stuck running) | Startup sweep transitions `running` rows older than 15 minutes to `failed` |
| FR-016 (per-user cap) | In-memory `_active_runs[user_id]` checked before insert; returns 429 when at cap |
