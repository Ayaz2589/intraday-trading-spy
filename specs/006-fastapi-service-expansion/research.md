# Phase 0 Research — Authenticated HTTP Backend for Backtests

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Each entry: **Decision → Rationale → Alternatives considered**.

## 1. JWT verification library

**Decision**: Use `pyjwt[crypto]>=2.9`. Verify Supabase-issued JWTs locally by fetching the project's JWKS at `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`, caching the keys with a 15-minute TTL, and using `jwt.decode(token, key, algorithms=["RS256", "ES256"], audience="authenticated")`.

**Rationale**:
- `pyjwt` is the de facto Python JWT library; small surface area, no native dependencies.
- Local verification (no network call per request to Supabase) keeps the auth dependency on the hot path under 1ms after the first token of a given key.
- Caching JWKS for 15 minutes balances key-rotation safety with cold-path latency.
- Supports both RS256 (legacy Supabase) and ES256 (newer Supabase projects).

**Alternatives considered**:
- **`python-jose`** — older, less maintained, harder dependency tree (cryptography + ecdsa).
- **`authlib`** — large library; we only need JWT verify, not OAuth2 client flows.
- **Call Supabase's `/auth/v1/user` endpoint per request** — adds 50-200ms RTT to every request. Rejected.

## 2. Background task model

**Decision**: FastAPI's built-in `BackgroundTasks` for v1. One in-process task pool per Uvicorn worker; single worker for the MVP. A `runs` table row is INSERTed BEFORE the BackgroundTask is queued (status = `queued`), then UPDATEd to `running` when the task starts and `finished`/`failed` when it ends.

**Rationale**:
- Zero new infrastructure — works the day Feature 008 deploys.
- Backtest durations (<10 minutes on the bundled fixture; longer on year-range data) fit comfortably in an in-process task before any timeout.
- Single-worker design means in-memory `_active_runs` tracker is authoritative for capacity enforcement (FR-016).
- Crash recovery: a startup-time sweep on Uvicorn boot transitions any `running` rows older than `polling_status_max_age_minutes` (default 15) to `failed`. Documented in `contracts/background-tasks.md`.

**Alternatives considered**:
- **Celery + Redis** — production-grade but adds two services + a queue protocol. Overkill for MVP; can land in a later feature if backtests grow to multi-hour.
- **RQ + Redis** — lighter than Celery but still requires Redis. Same calculus.
- **Threading directly (no BackgroundTasks)** — loses FastAPI's lifecycle hooks; reinvents what BackgroundTasks gives us.
- **Subprocess (fork a Python process per run)** — heavy; the engine + pandas is large to fork.

## 3. Run-state machine + status semantics

**Decision** *(updated per clarification 2026-05-30 / Q1)*: Four states: `queued` → `running` → (`finished` | `failed`). Stored in a NEW column `runs.status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','finished','failed'))`.

The `running → finished` transition is performed atomically with the data writes via a new Postgres function `push_run_finalize(jsonb)` (extends Feature 005's `push_run`). The function inserts trades / signals / journal_events AND updates `runs SET status='finished', status_updated_at=now()` inside the SAME transaction. There is no longer a separate UPDATE after `push_run` — the atomic single-write eliminates the inconsistency window described in clarification Q1.

The `running → failed` transition is a single UPDATE (the failure path has no data to write).

**Rationale**:
- Polling pattern: client polls `GET /api/runs/{id}/status` until `finished` or `failed`.
- Stale `running` rows are reaped by a startup sweep, satisfying FR-015 (no rows stuck in `running` forever).
- The DB column makes the state visible from outside the running process (e.g., a future admin tool).
- **Atomicity** (clarification Q1): a process crash between "data written" and "status flipped" can no longer leave a run with persisted trades/signals/events but `status = 'running'`. The single transaction is the eliminating mechanism.

**Implementation**: new migration `0052_push_run_finalize.sql` adds the `push_run_finalize(jsonb)` function. The existing `push_run(jsonb)` from Feature 005 stays as-is (used by the CLI push path, which writes complete runs with `status` already implicitly `finished` via the backfill in `0051_runs_status.sql`). The API path uses `push_run_finalize` exclusively.

**Alternatives considered**:
- **In-memory state only** — loses state across restarts; can't show "your last run failed because the service crashed" to the user.
- **Separate `run_status` table** — extra join for every read. Rejected.
- **State machine in application code only** — loses DB-level enforcement of valid transitions.
- **Two-phase: `running → finalizing → finished`** (Q1 option C) — observable but no functional gain over a single atomic transition. Rejected.

## 4. Schema migration for status column + journal kinds

**Decision**: Two new migrations:
- `0050_journal_event_kinds.sql` — extends the `journal_events.kind` CHECK list to include `api_request_received`, `backtest_started`, `backtest_finished`, `backtest_failed`, `data_download_started`, `data_download_finished`, `auth_failure`.
- `0051_runs_status.sql` — adds `runs.status` column with default `queued` and CHECK.

Both are idempotent (use `IF NOT EXISTS` for column add; `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT` for CHECK changes).

**Rationale**:
- Backward-compatible with Feature 005's data: existing rows get `status = 'queued'` then `'finished'` (we backfill in the migration).
- Idempotent so re-applying to a partially-migrated database is safe.

**Alternatives considered**:
- **In-place edit of Feature 005's `0006_journal_events.sql`** — violates the immutability-of-applied-migrations rule (Supabase CLI would refuse to re-push).
- **Skip the CHECK extension and just write the new kinds anyway** — INSERTs would fail the existing CHECK. Rejected.

## 5. Auth + user_id extraction pattern

**Decision**: A FastAPI dependency `auth_user_id` that:
1. Extracts the `Authorization: Bearer <jwt>` header.
2. Verifies the JWT against the cached JWKS (calls into `intraday_trade_spy.auth.token.verify_jwt`).
3. Returns the `sub` claim (the `auth.users.id` UUID).
4. Raises `HTTPException(401)` on any failure path — missing header, malformed token, expired, wrong signature, wrong audience.

Every protected router declares `user_id: UUID = Depends(auth_user_id)` as the first dependency. The unauthenticated `/healthz` does NOT use it.

**Rationale**:
- One place that enforces auth → cannot accidentally ship a protected endpoint without auth.
- Dependency injection makes test mocking trivial (`app.dependency_overrides[auth_user_id] = lambda: TEST_USER_UUID`).

**Alternatives considered**:
- **Middleware** (auth in `app.add_middleware`) — applies uniformly; can't easily exempt `/healthz` without conditionals.
- **Per-router decorator** — duplicates auth logic across routers.

## 6. Supabase storage client lifetime

**Decision**: One `SupabaseStorageClient` per request, constructed from a singleton-cached Supabase Python client. The singleton `supabase` client is created at app startup (Feature 005's `from_env()` reads `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`); the per-request wrapper sets `user_id = <auth_user_id from JWT>`.

**Rationale**:
- The Supabase Python client manages its own HTTP connection pool; one instance is enough for thousands of req/s.
- The wrapper's only stateful field is `user_id`, so per-request construction is cheap.
- The service-role key lives in one place (the singleton); rotating it means restarting the service.

**Alternatives considered**:
- **One wrapper per request, fully reconstructed** — duplicates HTTP setup.
- **One wrapper instance, mutated user_id per request** — race condition under concurrency.

## 7. Cross-user isolation: 404 vs 403

**Decision**: For READ endpoints (`GET /api/runs/{id}`, etc.), a row that belongs to another user returns `404 Not Found` — never `403 Forbidden`. The body is the same generic "run not found" message. The user cannot distinguish "doesn't exist" from "exists for someone else."

For WRITE endpoints (e.g., POSTing a backtest referencing another user's config), return `404` if we'd be referencing a foreign config; `400` if the body is malformed; `403` only for cases where the user is explicitly forbidden by policy (none yet).

**Rationale**:
- Returning `403` leaks the existence of a resource. `404` is the safer default.
- Standard practice in well-designed APIs (GitHub, Stripe, etc.).

**Alternatives considered**:
- **`403` consistently** — simpler but leaks existence.

## 8. CORS configuration

**Decision** *(updated per clarification 2026-05-30 / Q4)*: Config-default + env-var override. `backend/config/config.yaml` declares the dev defaults:

```yaml
api:
  cors_allow_origins:
    - http://localhost:5173    # Vite dev default (Feature 003 frontend)
    - http://localhost:5174    # alt port
  cors_allow_methods: ["GET", "POST", "DELETE", "OPTIONS"]
  cors_allow_headers: ["Authorization", "Content-Type"]
```

At runtime, two environment variables override the config:

- `CORS_ALLOW_ORIGINS` — comma-separated list. Wholly replaces the config's `cors_allow_origins`. Example: `CORS_ALLOW_ORIGINS=https://intraday.example.com,https://www.example.com`
- `CORS_ALLOW_ORIGIN_REGEX` — single regex (Python `re` syntax). Passed directly to `CORSMiddleware`'s `allow_origin_regex`. Example: `CORS_ALLOW_ORIGIN_REGEX=^https://intraday-trade-spy(-pr-\d+)?\.vercel\.app$` to match production + Vercel preview branches.

Feature 008's `fly.toml` sets these env vars; source code has no hardcoded production origin.

**Rationale**:
- Local dev with the existing Vite-served frontend works without manual intervention (FR-017).
- Production origins added via deployment configuration (env vars), not source code (clarification Q4).
- Standard 12-factor pattern; matches how Supabase + Vercel + Fly.io deployments typically express runtime config.

**Alternatives considered**:
- **CORS allow `*` in dev** — works but encourages bad habits.
- **Hardcode origins in source** — every env change requires a code change. Rejected (FR-017).
- **Domain-suffix matching** (Q4 option D, `*.vercel.app`) — broad; risks accepting any Vercel subdomain. Rejected.
- **Multiple config files for dev/prod** (Q4 option B) — duplicates wiring; env-var override is more idiomatic. Rejected.

## 9. Concurrent-run cap enforcement

**Decision**: An in-memory dict `_active_runs: dict[UUID, set[UUID]]` mapping user_id → set of active run_ids. Updated on `POST /api/backtests` (insert) and on background-task completion (remove). Check the cap BEFORE inserting the runs row — if `len(_active_runs[user_id]) >= 5`, return `429 Too Many Requests`.

**Rationale**:
- Simple, fast (no DB call to enforce the cap).
- Lost on restart, but the startup sweep (research §3) reconciles by transitioning any `running` rows older than 15 minutes to `failed` — releasing slots.
- Single-worker FastAPI keeps this authoritative.

**Alternatives considered**:
- **Database-enforced cap** — extra SELECT per request. Slower; doesn't help correctness because the in-memory tracker is fine for a single worker.
- **Redis-backed counter** — overkill for a single worker.

## 10. Health check + readiness

**Decision**: `GET /healthz` (unauthenticated) returns:
- `200` with `{"status": "ok", "db": "ok"}` when service is up AND a `SELECT 1` against Supabase succeeded within `health_check_timeout_s`.
- `503` with `{"status": "ok", "db": "unreachable"}` when service is up but the DB check failed.

Fly.io and similar platforms use this for liveness + readiness checks.

**Rationale**:
- Differentiates "service crashed" (no response / connection refused) from "service running, DB unreachable" — useful when the DB is down and we want to fail fast.
- Returns under 200ms in normal operation (SC-005).

**Alternatives considered**:
- **Two endpoints (`/healthz` + `/readyz`)** — Fly.io style. Defer; one is enough for MVP.

## 11. Data-download endpoint async pattern

**Decision** *(updated per clarification 2026-05-30 / Q3)*: `POST /api/data/download` body: `{ "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD" }`. Returns `202` immediately with `{ "job_id": "<uuid>", "status": "queued" }`. The job runs in a BackgroundTask that:

1. Updates the job row to `running`.
2. Calls `intraday_trade_spy.data.downloader.download_spy()` for the date range.
3. **On transient failure** (network error, HTTP 5xx, HTTP 429): retries up to 3 times with exponential backoff `1s → 2s → 4s` before marking the job `failed`. Configured via `api.data_download.retry_attempts` (default 3) and `api.data_download.retry_backoff_seconds` (default `[1, 2, 4]`) in `config.yaml`.
4. **On non-transient failure** (invalid date range, "no data" empty result, validation error): marks the job `failed` immediately with the upstream error in `failure_reason`.
5. On success: uploads the result CSV to Supabase Storage at `{user_id}/spy_5m_{start}_{end}.csv`, updates the job row to `finished` with the `storage_path` populated.

Transient-vs-non-transient classification lives in `intraday_trade_spy.data.downloader._is_transient_error(exc)`.

**Rationale**:
- Mirrors the run lifecycle pattern (research §3).
- Reuses the existing yfinance downloader from Feature 002 + adds retry orchestration around it.
- Storage path matches Feature 005's `raw-data` bucket policy.
- **Retry behavior** (clarification Q3): Yahoo throttles aggressively; one 429 is common but the next request usually succeeds. Bounded retry resolves the common case without users having to manually re-call. Non-transient errors fail fast so users get clear feedback instead of waiting through doomed retries.

**Alternatives considered**:
- **Synchronous download** — yfinance fetches for large ranges take 30+ seconds; would tie up a request-handling thread.
- **Reuse the same `runs` table** — semantically wrong; downloads aren't backtest runs.
- **Fail fast on any error** (Q3 option A) — annoying user experience for transient hiccups.
- **Aggressive retry (5+ attempts)** (Q3 option C) — burns bandwidth; 60+ second per-download wait time hurts UX even when it eventually succeeds.
- **Hybrid auto-queue retry** (Q3 option D) — needs a retry-tracking table; overkill for v1.

## 12. Dockerfile + fly.toml

**Decision**:
- `Dockerfile` uses `python:3.11-slim` as base, installs `pip install -e ".[dev]"`-friendly deps via `pyproject.toml`, runs `uvicorn intraday_trade_spy.api.app:app --host 0.0.0.0 --port 8000`.
- `fly.toml` declares one service on port 8000, single instance, health check against `/healthz` every 15s.

**Rationale**:
- Base image already has Python; no compile step needed.
- Single-stage build: small Dockerfile, fast to read.
- Feature 008 picks this up unchanged.

**Alternatives considered**:
- **Multi-stage build** with a builder layer and a minimal runtime layer — saves ~50MB, complicates the Dockerfile. Defer optimization.
- **Distroless base** — minor security win, less developer-friendly. Defer.

## 13. Test infrastructure reuse

**Decision**: API integration tests reuse Feature 005's `tests/storage/conftest.py` fixtures (`local_supabase`, `user_a_id`, `user_b_id`, `clean_db`). The new `tests/api/integration/conftest.py` adds a `fastapi_client` fixture that builds a `TestClient` over the same `app` and a helper `mint_jwt(user_id)` that signs a short-lived test JWT with the local Supabase's JWT secret.

**Rationale**:
- No fixture duplication.
- Tests run against the same database the production app would talk to (no mocks).
- Local Supabase's JWT secret is well-known and stable, so minting test JWTs is deterministic.

**Alternatives considered**:
- **Mock the JWT verifier in integration tests** — defeats the purpose of integration tests (the JWT path IS the critical security boundary).

---

## 14. Data-retention policy (declared, not enforced)

**Decision** *(per clarification 2026-05-30 / Q5)*: Document a data-retention policy in `backend/config/config.yaml` under a new `retention:` section. The policy is DECLARED in this feature; the actual delete jobs are DEFERRED to a later feature (or to Feature 008's deploy via a `pg_cron` job).

Defaults:

```yaml
retention:
  # Number of days after which a row is eligible for deletion.
  # NOT enforced in Feature 006 — see FR-019.
  failed_runs_days: 90
  audit_events_days: 30          # journal_events with kind='api_request_received'
  failed_downloads_days: 30      # data_download_jobs with status='failed'
```

**Rationale**:
- The audit-log table (`journal_events`) accumulates fast — one row per API request. Without a policy, the table grows linearly with usage and dominates DB size within a few months.
- Shipping the *policy* now (config + FR-019) gives downstream operators (Feature 008) something concrete to enforce against.
- Deferring *enforcement* avoids accidentally deleting data the team turns out to want (e.g., during early debugging).
- Aligns with the "ship the policy, not the cron job" engineering principle.

**Alternatives considered**:
- **Keep everything forever** (Q5 option A) — simplest but unbounded cost growth. Rejected.
- **Implement pruning in this feature as a startup sweep** (Q5 option C) — adds risk of accidentally deleting valid data with no operator review. Rejected.
- **Pg_cron job declared in this feature** (Q5 option D) — couples cron scheduling to Feature 008's deploy decisions. Deferred to Feature 008.

---

## Summary

Every spec-level decision and plan-level unknown is resolved. The 14 chosen technologies + patterns are:

1. `pyjwt[crypto]>=2.9` with JWKS caching (15-min TTL)
2. FastAPI `BackgroundTasks` for v1 (no Celery/RQ/Redis)
3. 4-state run lifecycle (`queued`/`running`/`finished`/`failed`) in a new `runs.status` column; `running → finished` is atomic with data writes via the new `push_run_finalize(jsonb)` RPC (clarification Q1)
4. Three new migrations: `0050_journal_event_kinds.sql`, `0051_runs_status.sql`, `0052_push_run_finalize.sql`, plus `0060_data_download_jobs.sql`
5. Auth via FastAPI `Depends()` chain (not middleware)
6. One Supabase client singleton + per-request wrapper
7. `404` (not `403`) for cross-user reads to avoid existence-leak
8. CORS origins env-var-overridable (config defaults + `CORS_ALLOW_ORIGINS` / `CORS_ALLOW_ORIGIN_REGEX` env overrides — clarification Q4)
9. In-memory concurrent-run cap (5 per user) + startup sweep for crash recovery
10. `/healthz` returns 200 (DB ok) or 503 (DB unreachable) under 200ms
11. Data-download endpoint retries transient yfinance failures up to 3× with exponential backoff `1s → 2s → 4s` (clarification Q3); fails fast on non-transient errors
12. Single-stage `python:3.11-slim` Dockerfile; `fly.toml` ready for Feature 008
13. Test fixtures reuse Feature 005's; integration tests use real JWTs minted with the local Supabase secret
14. Data-retention policy DECLARED in `config.yaml` (`retention.failed_runs_days: 90`, `retention.audit_events_days: 30`, `retention.failed_downloads_days: 30`); enforcement deferred to a later feature (clarification Q5)

All list endpoints use opaque base64-encoded cursor pagination (`(natural_ordering_column, id)` tuple) — stable under concurrent inserts/deletes (clarification Q2). See `contracts/endpoints.md` for wire format.

No NEEDS CLARIFICATION markers remain. Ready for Phase 1.
