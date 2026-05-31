---

description: "Tasks for Feature 006 — Authenticated HTTP Backend for Backtests"
---

# Tasks: Authenticated HTTP Backend for Backtests

**Input**: Design documents from `/specs/006-fastapi-service-expansion/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Clarifications applied** (from `/speckit-clarify` 2026-05-30): Q1 atomic `push_run_finalize`; Q2 opaque cursor pagination; Q3 bounded yfinance retry; Q4 env-var CORS; Q5 declared (not enforced) retention policy.

**Tests**: Per constitution principle IV (Test-First Everywhere, NON-NEGOTIABLE, v1.1.0), tests are MANDATORY for any task that touches `backend/src/**/*.py` or `frontend/src/**/*.{ts,tsx}`. Every implementation task has a preceding failing-test task with the same scope.

SQL migrations under `backend/db/migrations/*.sql` are config-adjacent per the constitution's exempt list — paired with integration tests anyway because they encode constitutional invariants (CHECK constraints, atomic RPC, etc.).

**Organization**: Tasks are grouped by user story (US1 = push-then-poll-then-fetch; US2 = cross-user isolation; US3 = strategy discovery + data download; US4 = containerization).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps task to user story for traceability
- Every task names exact file paths

## Path Conventions

Web app monorepo: backend at `backend/`, frontend at `frontend/`. This feature touches `backend/` only.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project-level setup that every user story builds on.

- [X] T001 Add `pyjwt[crypto]>=2.9` to `[project].dependencies` and promote `httpx>=0.27` from dev to runtime in `backend/pyproject.toml`
- [X] T002 [P] Add `api:` section to `backend/config/config.yaml` with `max_concurrent_runs_per_user: 5`, `polling_status_max_age_minutes: 15`, `health_check_timeout_s: 5`, `cors_allow_origins: [http://localhost:5173, http://localhost:5174]`, `cors_allow_methods: [GET, POST, DELETE, OPTIONS]`, `cors_allow_headers: [Authorization, Content-Type]`, `data_download: {retry_attempts: 3, retry_backoff_seconds: [1, 2, 4], max_concurrent_per_user: 3}`
- [X] T003 [P] Add `retention:` section to `backend/config/config.yaml` with `failed_runs_days: 90`, `audit_events_days: 30`, `failed_downloads_days: 30` (declared, not enforced — clarification Q5)
- [X] T004 [P] Update `backend/.env.example` to document `SUPABASE_JWT_SECRET` (optional, used by integration tests against local Supabase), `CORS_ALLOW_ORIGINS` (optional production override), and `CORS_ALLOW_ORIGIN_REGEX` (optional, for Vercel preview branches)
- [X] T005 [P] Update `backend/README.md` with an "HTTP API (Feature 006)" subsection linking to [specs/006-fastapi-service-expansion/quickstart.md](./quickstart.md) and listing the `make api-dev` and `make test-api-integration` targets

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema migrations + auth/JWT module + app skeleton + test fixtures. ALL user stories depend on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### 2a. Schema migrations (3 SQL files + tests)

- [X] T006 [P] Write failing schema tests covering the new `runs.status` column + the extended `journal_events.kind` CHECK list + the new `data_download_jobs` table + the new `push_run_finalize(jsonb)` RPC in `backend/tests/api/integration/test_schema_extensions.py` (marked `integration`)
- [X] T007 [P] Create migration `backend/db/migrations/0050_journal_event_kinds.sql` — drop + re-create `journal_events_kind_check` CHECK with the 7 new kinds appended (`api_request_received`, `backtest_started`, `backtest_finished`, `backtest_failed`, `data_download_started`, `data_download_finished`, `auth_failure`)
- [X] T008 [P] Create migration `backend/db/migrations/0051_runs_status.sql` — `ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','finished','failed'))`, `status_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `failure_reason TEXT`; backfill existing rows with `status='finished'`
- [X] T009 Create migration `backend/db/migrations/0052_push_run_finalize.sql` — defines the new `push_run_finalize(jsonb)` Postgres function (atomic INSERT of trades/signals/journal_events + UPDATE of `runs.status='finished'` in one transaction; rejects payloads when current status is not `running`). See [data-model.md §5](./data-model.md) for full SQL.
- [X] T010 [P] Create migration `backend/db/migrations/0060_data_download_jobs.sql` — table with `id`, `user_id`, `start_date`, `end_date`, `status`, `storage_path`, `status_updated_at`, `failure_reason`, `created_at` + indexes + RLS policy `(user_id = auth.uid())` + service-role bypass

### 2b. Auth module (JWT verification)

- [X] T011 [P] Write failing tests for `intraday_trade_spy.auth.jwks.get_jwks()` covering: cache hit within TTL, cache miss with network failure, stale cache returned with warning when network is down, fresh fetch after TTL expiry in `backend/tests/auth/test_jwks.py`
- [X] T012 [P] Write failing tests for `intraday_trade_spy.auth.token.verify_jwt()` covering all 6 failure modes from [contracts/jwt-auth.md](./contracts/jwt-auth.md) (empty, malformed, wrong sig, wrong audience, expired, missing/invalid sub) + the success path in `backend/tests/auth/test_token_verify.py`
- [X] T013 [P] Implement `backend/src/intraday_trade_spy/auth/__init__.py` exposing `verify_jwt`, `get_jwks`, `AuthError`
- [X] T014 [P] Implement `backend/src/intraday_trade_spy/auth/jwks.py` with TTL-cached JWKS fetcher (15-min TTL per research §1)
- [X] T015 Implement `backend/src/intraday_trade_spy/auth/token.py` with `verify_jwt(token: str) -> UUID` per [contracts/jwt-auth.md](./contracts/jwt-auth.md); depends on T014

### 2c. FastAPI app skeleton + deps

- [X] T016 [P] Write failing test for FastAPI app construction (importable `intraday_trade_spy.api.app:app`, exposes `/healthz`, mounts `/legacy/*` routes) in `backend/tests/api/new/test_app_skeleton.py`
- [X] T017 [P] Write failing tests for `intraday_trade_spy.api.deps.auth_user_id` (extracts header, calls verify_jwt, raises HTTPException(401) on failure, emits `auth_failure` journal event on non-trivial failures) in `backend/tests/api/new/test_auth_dep.py`
- [X] T018 [P] Write failing tests for `intraday_trade_spy.api.errors` typed error responses (every documented error code from [contracts/endpoints.md §Error response shape](./contracts/endpoints.md)) in `backend/tests/api/new/test_errors.py`
- [X] T019 [P] Write failing tests for `intraday_trade_spy.api.pagination` opaque cursor encode/decode (round-trip stability, malformed-cursor rejection) **AND cursor stability under concurrent inserts** (covers analyze finding C1): simulate fetching page 1, then inserting a new row at the head of the natural ordering, then fetching page 2 with the previous next_cursor — assert page 2 does NOT skip or repeat any row from page 1's result set (this is the Q2 guarantee). In `backend/tests/api/new/test_pagination.py`.
- [X] T020 Implement `backend/src/intraday_trade_spy/api/app.py` — top-level FastAPI app with CORSMiddleware (config-driven with env-var override per clarification Q4 / research §8), startup hook calling `sweep_stale_runs`, router registration, legacy router mounted at `/legacy/`
- [X] T021 [P] Implement `backend/src/intraday_trade_spy/api/deps.py` — `auth_user_id` and `get_storage_client` Depends helpers
- [X] T022 [P] Implement `backend/src/intraday_trade_spy/api/errors.py` — typed HTTP error responses with the documented codes from contracts
- [X] T023 [P] Implement `backend/src/intraday_trade_spy/api/pagination.py` — opaque cursor encode/decode functions (clarification Q2; `base64url((natural_key, id))`)
- [X] T024 [P] Implement `backend/src/intraday_trade_spy/api/schemas.py` — Pydantic request/response models per [data-model.md §4](./data-model.md)
- [X] T024a [P] Write failing tests for `api/schemas.py` (covers analyze finding D1): `StartBacktestRequest` rejects body without `config_name`; rejects body with forbidden fields `symbol`, `direction`, `live_auto_enabled` per constitution I/II/V; `StartDataDownloadRequest` rejects `end_date < start_date`; `HealthResponse` literal status; all `*ListResponse` shapes carry `next_cursor: Optional[str]`. In `backend/tests/api/new/test_schemas.py`. (Despite the suffix `a`, this task MUST be written BEFORE T024 — the suffix denotes insertion order in the file, not execution order. Same TDD discipline as every other pair.)

### 2d. Storage client extension (push_run_finalize)

- [X] T025 [P] Write failing test for `SupabaseStorageClient.push_run_finalize(payload, run_id)` (calls RPC, raises on non-running status, returns run_id on success) in `backend/tests/storage/test_client_push_finalize.py`
- [X] T026 Implement `SupabaseStorageClient.push_run_finalize()` in `backend/src/intraday_trade_spy/storage/client.py` (mirrors `push_run` but calls the new `push_run_finalize` RPC)

### 2e. Run lifecycle module

- [X] T027 [P] Write failing tests for `intraday_trade_spy.api.lifecycle._active_runs` tracker (add/remove under lock, cap enforcement) in `backend/tests/api/new/test_lifecycle_tracker.py`
- [X] T028 [P] Write failing tests for `intraday_trade_spy.api.lifecycle.start_backtest()` (inserts row in queued, enqueues BackgroundTask, reserves slot) + `_run_backtest_task` (transitions queued→running→finished via atomic finalize on success; queued/running→failed on any error path; releases slot in finally) per [contracts/background-tasks.md](./contracts/background-tasks.md) in `backend/tests/api/new/test_lifecycle.py`. **Must also assert journal_events emission** (covers analyze finding V1, constitution principle VII): on `queued → running`, a row with `kind='backtest_started'` is written; on `running → finished`, a row with `kind='backtest_finished'` is written (inside the same atomic finalize transaction); on `running → failed`, a row with `kind='backtest_failed'` is written with the exception summary in `details`. Test asserts row counts in `journal_events` after each transition.
- [X] T029 [P] Write failing tests for `intraday_trade_spy.api.lifecycle.sweep_stale_runs()` (reaps rows older than 15 min in `running`; doesn't touch recent `running` rows; emits a journal event per row reaped) in `backend/tests/api/new/test_sweep.py`
- [X] T030 Implement `backend/src/intraday_trade_spy/api/lifecycle.py` — `_active_runs` tracker + `start_backtest()` + `_run_backtest_task()` + `sweep_stale_runs()` + lifecycle journal-event helpers; depends on T026

### 2f. Test fixtures

- [X] T031 Create `backend/tests/api/integration/conftest.py` with fixtures: `fastapi_client` (TestClient over `app`), `mint_jwt(user_id, secret, aud='authenticated')` helper, `local_supabase_jwt_secret` fixture (reads from `supabase status --output env`), reuses `local_supabase` / `user_a_id` / `user_b_id` / `clean_db` from `tests/storage/conftest.py`
- [X] T032 [P] Create `backend/tests/api/new/__init__.py` and `backend/tests/api/integration/__init__.py` (empty marker files)
- [X] T033 [P] Create `backend/tests/auth/__init__.py` (empty marker file) + `backend/tests/auth/conftest.py` with `dummy_jwks_payload`, `make_token(user_id, secret, aud='authenticated')` helpers

**Checkpoint**: Foundation ready — schema deployed, JWT verification works, app skeleton importable, lifecycle module functional, fixtures in place. User story implementation can now begin in parallel.

---

## Phase 3: User Story 1 — Start a backtest run and view its results (Priority: P1) 🎯 MVP

**Goal**: An authenticated user can POST a backtest, poll status until finished, and fetch the run + trades + signals + journal events — scoped to their account.

**Independent Test**: From a shell with `ACCESS_TOKEN=<valid JWT>`, run `curl -X POST /api/backtests -d '{"config_name":"default"}'`; poll `/api/runs/{id}/status` until `finished`; `curl /api/runs/{id}` returns the summary; the run's numbers match a local backtest of the same fixture.

### Tests for User Story 1 ⚠️

> Write these tests FIRST and confirm they FAIL before implementation.

- [X] T034 [P] [US1] Write failing tests for `GET /healthz` (200 when DB reachable; 503 when DB unreachable; under 200ms; unauthenticated) in `backend/tests/api/new/test_health.py`
- [X] T035 [P] [US1] Write failing tests for `POST /api/backtests` covering all rows in [contracts/endpoints.md POST /api/backtests](./contracts/endpoints.md) (success 202, 400 malformed, 401 missing/invalid JWT, 404 config not found, 429 cap exceeded, 503 DB unreachable, body with `symbol` rejected per constitution I) in `backend/tests/api/new/test_backtests.py`
- [X] T036 [P] [US1] Write failing tests for `GET /api/runs/{id}` (200 returns full run, 401 missing JWT, 404 run owned by another user, 404 run does not exist) in `backend/tests/api/new/test_runs_detail.py`
- [X] T037 [P] [US1] Write failing tests for `GET /api/runs/{id}/status` (returns queued/running/finished/failed; failure_reason populated only for failed; user-isolation 404) in `backend/tests/api/new/test_runs_status.py`
- [X] T038 [P] [US1] Write failing tests for `GET /api/runs/{id}/trades` (paginated with opaque cursor; user-isolation; correct shape) in `backend/tests/api/new/test_runs_trades.py`
- [X] T039 [P] [US1] Write failing tests for `GET /api/runs/{id}/signals` covering `?executed=false` filter and including rejected signals as first-class records (constitution VII) in `backend/tests/api/new/test_runs_signals.py`
- [X] T040 [P] [US1] Write failing tests for `GET /api/runs/{id}/journal` (cursor-paginated; user-isolation) in `backend/tests/api/new/test_runs_journal.py`
- [X] T041 [US1] Write failing INTEGRATION test for the full lifecycle: start backtest → poll status → fetch summary → fetch trades + signals + journal, against a local Supabase, asserting cloud row counts match local backtest of the same fixture (SC-001, SC-004) in `backend/tests/api/integration/test_run_lifecycle.py`
- [ ] T042 [US1] Write failing INTEGRATION test for atomic finalize (clarification Q1): mock `push_run_finalize` to raise mid-transaction; assert no `trades`/`signals`/`journal_events` rows persisted AND `runs.status` is `failed` (not `running`) in `backend/tests/api/integration/test_atomic_finalize.py`. **Additionally enforce the SC-008 failure-latency budget** (covers analyze finding E1): time the interval between the simulated engine crash and the moment `GET /api/runs/{id}/status` returns `failed`. The test asserts that interval is < 5 seconds end-to-end (matching SC-008's "reports `failed` status to the caller within 5 seconds of the crash").
- [ ] T043 [US1] Write failing INTEGRATION test for the concurrent-run cap: kick off 5 simultaneous starts (all succeed) + a 6th (429 Too Many Requests) in `backend/tests/api/integration/test_concurrent_cap.py`
- [ ] T044 [US1] Write failing INTEGRATION test for crash recovery (FR-015): insert a `running` row older than 15 min directly into DB; restart app; assert `sweep_stale_runs` transitioned it to `failed` with a "service restart" failure_reason in `backend/tests/api/integration/test_crash_recovery.py`

### Implementation for User Story 1

- [X] T045 [US1] Implement `backend/src/intraday_trade_spy/api/routers/health.py` — `GET /healthz` returning `{status, db}` (200 or 503) per [contracts/endpoints.md GET /healthz](./contracts/endpoints.md)
- [X] T046 [US1] Implement `backend/src/intraday_trade_spy/api/routers/backtests.py` — `POST /api/backtests`; validates `config_name`, looks up config + strategy, calls `lifecycle.start_backtest`; returns 202 + run_id
- [X] T047 [US1] Implement `backend/src/intraday_trade_spy/api/routers/runs.py` — five GET endpoints (`/api/runs`, `/api/runs/{id}`, `/api/runs/{id}/status`, `/api/runs/{id}/trades`, `/api/runs/{id}/signals`, `/api/runs/{id}/journal`); all use opaque cursor pagination via `api.pagination` helpers; cross-user reads return 404
- [X] T048 [US1] Register routers in `backend/src/intraday_trade_spy/api/app.py`: mount `health` (unauthenticated), `backtests` and `runs` under `/api`
- [X] T049 [US1] Make legacy router accessible: move the existing `static_server.py` endpoints behind a `/legacy/` prefix in `backend/src/intraday_trade_spy/api/app.py` (preserve existing Feature 003 frontend compatibility, FR-009, SC-007)
- [X] T050 [US1] Add `api-dev` target to root `Makefile`: `cd backend && set -a; source .env; set +a && .venv/bin/uvicorn intraday_trade_spy.api.app:app --host 127.0.0.1 --port 8000 --reload`

**Checkpoint**: User Story 1 is fully functional. An authenticated user can drive the entire backtest lifecycle via HTTP. SC-001, SC-003, SC-004, SC-005, SC-007, SC-008 are demonstrable.

---

## Phase 4: User Story 2 — Cross-user isolation (Priority: P2)

**Goal**: Every endpoint refuses to leak data or accept writes against another user's resources. Verified across the FULL endpoint matrix.

**Independent Test**: An automated test seeds users A and B; exercises every endpoint with mismatched-user tokens; every cross-user attempt returns `404` (read) or `403/404` (write). DB introspection confirms no leaked data.

US2 builds on US1's endpoints — the implementations from Phase 3 already include user-id scoping. This phase EXISTS to ensure the test matrix is comprehensive.

### Tests for User Story 2 ⚠️

- [X] T051 [P] [US2] Write the full cross-user isolation INTEGRATION matrix in `backend/tests/api/integration/test_cross_user_isolation.py`. For each of the 9 endpoints with a `{id}` or implicit user filter, verify user A's JWT cannot SEE / FETCH / TARGET user B's resources. Per FR-002 and SC-002.

  Matrix cells:
  - `GET /api/runs` with A's JWT does not return any of B's runs.
  - `GET /api/runs/{B's run_id}` with A's JWT → `404`.
  - `GET /api/runs/{B's run_id}/status` with A's JWT → `404`.
  - `GET /api/runs/{B's run_id}/trades` with A's JWT → `404`.
  - `GET /api/runs/{B's run_id}/signals` with A's JWT → `404`.
  - `GET /api/runs/{B's run_id}/journal` with A's JWT → `404`.
  - `POST /api/backtests` with A's JWT and a `config_name` that belongs to B → `404 config_not_found`.
  - `POST /api/data/download` with A's JWT → only A's row appears in `data_download_jobs`.
  - `GET /api/data/downloads/{B's job_id}` with A's JWT → `404`.

- [X] T052 [P] [US2] Write INTEGRATION test for service-role JWT refusal: present a JWT with `aud=service_role` as a bearer token; assert all protected endpoints return `401` and an `auth_failure` journal event is emitted (FR-014) in `backend/tests/api/integration/test_service_role_refusal.py`

### Implementation for User Story 2

US2 is mostly test-driven verification — the user-scoping is already in the US1 implementation. The only NEW implementation:

- [X] T053 [US2] Verify and (if missing) add `auth_failure` journal-event emission in `intraday_trade_spy.api.deps.auth_user_id` — every 401 from a malformed/expired/wrong-audience token emits a row to `journal_events` with `kind='auth_failure'` (FR-012)

**Checkpoint**: SC-002 demonstrable — every cross-user access path refused. The test matrix becomes a guardrail for future endpoint additions.

---

## Phase 5: User Story 3 — Strategy discovery + historical-data download (Priority: P3)

**Goal**: Authenticated user can list strategies and trigger an async historical-data download with bounded retry.

**Independent Test**: `curl /api/strategies` returns the seeded strategy. `POST /api/data/download` with a small date range completes within a reasonable budget; data appears in Supabase Storage; subsequent backtests can use it.

### Tests for User Story 3 ⚠️

- [X] T054 [P] [US3] Write failing tests for `GET /api/strategies` (returns enabled strategies only, includes `vwap_pullback_long` after Feature 005 seed; user-isolation: every authenticated user sees the same registry) in `backend/tests/api/new/test_strategies.py`
- [X] T055 [P] [US3] Write failing tests for `POST /api/data/download` covering: 202 happy path, 400 invalid date range, 400 range > 60 days, 401 missing JWT, 429 cap exceeded, body validation in `backend/tests/api/new/test_data_download_post.py`
- [X] T056 [P] [US3] Write failing tests for `GET /api/data/downloads/{id}` (returns job state; user-isolation 404) in `backend/tests/api/new/test_data_download_get.py`
- [ ] T057 [US3] Write failing INTEGRATION test for the retry behavior (clarification Q3): mock yfinance to return HTTP 429 twice then 200; assert the job goes `queued → running → finished`, NOT `failed`. Then mock 3 consecutive 429s and assert the job is `failed` after retry exhaustion. Then mock a non-transient error (empty result) and assert immediate `failed` with no retries. In `backend/tests/api/integration/test_data_download_retry.py`
- [ ] T058 [US3] Write failing INTEGRATION test for download end-to-end: POST /api/data/download → poll until finished → assert the CSV is present in Supabase Storage at `{user_id}/spy_5m_<start>_<end>.csv` in `backend/tests/api/integration/test_data_download.py`

### Implementation for User Story 3

- [X] T059 [US3] Add `_is_transient_error(exc) -> bool` helper to `backend/src/intraday_trade_spy/data/downloader.py` (classifies network errors, 5xx, 429 as transient; everything else non-transient per clarification Q3)
- [X] T059a [P] [US3] Write failing tests for `_is_transient_error` (covers analyze finding D2): one parametrized test per row of the transient/non-transient table from [contracts/endpoints.md POST /api/data/download](./contracts/endpoints.md) — `ConnectionError` → True, `httpx.TimeoutException` → True, HTTP 500 → True, HTTP 429 → True, HTTP 404 → False, `ValueError("invalid date range")` → False, empty DataFrame → False. In `backend/tests/data/test_downloader_transient.py`. (Like T024a, must be written BEFORE T059.)
- [X] T060 [US3] Implement `backend/src/intraday_trade_spy/api/routers/strategies.py` — `GET /api/strategies` reading from the registry with `enabled=true` filter
- [X] T061 [US3] Implement `backend/src/intraday_trade_spy/api/routers/data.py` — `POST /api/data/download` (validation + insert row + enqueue BackgroundTask) and `GET /api/data/downloads/{id}` (return job state); BackgroundTask runs the existing `download_spy()` with bounded-retry-with-backoff using the new helper (clarification Q3)
- [X] T062 [US3] Register the new routers in `backend/src/intraday_trade_spy/api/app.py`

**Checkpoint**: SC-001-adjacent functionality complete. User can discover strategies and fetch historical data without operator help.

---

## Phase 6: User Story 4 — Deployable container image (Priority: P4)

**Goal**: A single Docker image of the service runs locally against the cloud database — same image Feature 008 deploys to Fly.io.

**Independent Test**: `docker build -t intraday-trade-spy:dev backend/ && docker run --rm -p 8000:8000 --env-file backend/.env intraday-trade-spy:dev`; `curl http://localhost:8000/healthz` returns 200; `curl -X POST .../api/backtests` works just like local uvicorn.

### Tests for User Story 4 ⚠️

- [ ] T063 [P] [US4] Write failing test that builds the Docker image and asserts it produces a runnable container image with the expected entrypoint in `backend/tests/api/integration/test_docker_build.py` (uses subprocess; marked `slow` and `integration` so it doesn't run by default)

### Implementation for User Story 4

- [X] T064 [US4] Create `backend/Dockerfile` per [research.md §12](./research.md) — `python:3.11-slim` base, COPY pyproject.toml + lock, `pip install -e .` (omit `[dev]` extras in the final image), COPY src/, CMD `uvicorn intraday_trade_spy.api.app:app --host 0.0.0.0 --port 8000`
- [X] T065 [US4] Create `backend/fly.toml` declaring one service on port 8000, single instance, health check against `/healthz` every 15s. Feature 008 reads this without modification.
- [X] T066 [US4] Add `.dockerignore` at `backend/.dockerignore` excluding `.venv`, `tests/`, `data/`, `__pycache__`, `.env`, `.supabase/`, `*.pyc`, `*.pyo`
- [X] T067 [US4] Document `docker build` + `docker run` recipes in [quickstart.md §11](./quickstart.md) (already drafted; verify it works end-to-end)

**Checkpoint**: SC-006 demonstrable — Feature 008 inherits a deployable artifact.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, observability polish, and the analyze gate before merge.

- [X] T068 [P] Update root `README.md` with the "HTTP API (Feature 006)" subsection cross-linking to `specs/006-fastapi-service-expansion/quickstart.md` and adding the `make api-dev` command to the essentials list
- [X] T069 [P] Update `Makefile`: add `test-api-integration` target (`cd backend && SUPABASE_INTEGRATION=1 .venv/bin/pytest -q -m integration tests/api/integration/`); update `make help` to mention `PUSH=1`, `test-integration`, `test-api-integration`, `api-dev`
- [X] T070 [P] Document FR-019 retention policy in `docs/retention-policy.md` — what's eligible for deletion, defaults, where to configure, who's responsible for enforcement (deferred to a later feature)
- [ ] T071 Run `/speckit-analyze` to cross-check spec ↔ plan ↔ tasks consistency for this feature. Address any findings.
- [ ] T072 Run [quickstart.md](./quickstart.md) end-to-end on a fresh checkout. Fix any documentation drift. Sign-off blocks the feature.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Story 1 (Phase 3, P1, MVP)**: Depends on Foundational. Independent of US2/US3/US4.
- **User Story 2 (Phase 4, P2)**: Depends on US1's endpoint implementations (T045-T049) being in place — tests verify behavior the US1 implementation should provide.
- **User Story 3 (Phase 5, P3)**: Depends on Foundational. Independent of US1 and US2.
- **User Story 4 (Phase 6, P4)**: Depends on US1, US3 being implemented (so there's something for the Docker image to expose). Independent of US2.
- **Polish (Phase 7)**: T068-T070 parallel after US1; T071-T072 after everything.

### Within Phase 2 (Foundational)

- T006 (schema test file) writes BEFORE T007-T010 (migrations) per TDD.
- T009 (`0052_push_run_finalize.sql`) depends conceptually on T008 (`0051_runs_status.sql`) — both touch `runs` table.
- T011-T012 (auth tests) write BEFORE T013-T015 (auth impl).
- T015 (`token.py`) depends on T014 (`jwks.py`).
- T016-T019 (skeleton/deps tests) write BEFORE T020-T024 (impl).
- T024a (schemas tests) writes BEFORE T024 (schemas impl) per principle IV.
- T020 (`app.py`) depends on T021, T022, T023, T024 (the dependency helpers + schemas the app uses).
- T025 (`push_run_finalize` client test) writes BEFORE T026 (impl).
- T027-T029 (lifecycle tests) write BEFORE T030 (impl).
- T030 (`lifecycle.py`) depends on T026 (`push_run_finalize` client method).
- T031 (api/integration/conftest.py) depends on tests/storage/conftest.py from Feature 005 (already exists).

### Within Phase 3 (US1)

- T034-T043 (all tests) write and FAIL before any implementation (T045 onward) starts.
- T045 (health router) independent — no other dependencies.
- T046 (backtests router) depends on T030 (`lifecycle.start_backtest`).
- T047 (runs router) depends on T023 (`pagination`), T024 (`schemas`).
- T048 (router registration in app.py) depends on T045, T046, T047.
- T049 (legacy mount) is independent and parallel.
- T050 (Makefile) is independent.

### Within Phase 4 (US2)

- T051 (cross-user matrix) and T052 (service-role refusal) can write in parallel.
- T053 is small and tied to T017 (auth_dep test) — likely a no-op verification.

### Within Phase 5 (US3)

- T054-T056 (router tests) parallel.
- T057-T058 (integration tests) parallel.
- T059a (transient-error tests) writes BEFORE T059 (impl) per principle IV.
- T059 (downloader helper) before T061 (router that uses it).
- T060-T061 (router impl) parallel after their tests fail.
- T062 (register routers) depends on T060, T061.

### Within Phase 6 (US4)

- T063 (docker build test) writes BEFORE T064 (Dockerfile).
- T064-T066 parallel after T063.
- T067 is documentation.

### Parallel Opportunities

**Phase 1 setup**: T002, T003, T004, T005 in parallel after T001 (which adds the runtime dep).

**Phase 2 migrations**: T007, T008, T009, T010 parallel after T006.

**Phase 2 auth**: T011 + T012 + T013 + T014 parallel; T015 sequential after T014.

**Phase 2 skeleton/deps**: T016-T019 + T024a (tests) parallel; T020-T024 (impl) parallel where files differ; T020 sequential after the others land.

**Phase 2 lifecycle**: T025 sequential before T026; T027-T029 parallel; T030 sequential.

**Phase 3 US1 test files**: T034-T040 all in parallel (different test files). T041-T044 integration tests, can be parallel after foundation is in place.

**Phase 3 US1 impl**: T045, T046, T047, T049 in parallel after their tests; T048, T050 after.

**Phase 4 US2**: T051, T052 parallel.

**Phase 5 US3**: T054, T055, T056, T057, T058 parallel; T059a (transient-error test) before T059 (impl); T060, T061 parallel; T062 after.

**Phase 6 US4**: T063 first; T064, T065, T066 parallel.

**Phase 7 Polish**: T068, T069, T070 parallel; T071, T072 after.

---

## Parallel Example: Phase 3 — User Story 1 tests

```bash
# Launch all US1 endpoint test files in parallel BEFORE any implementation:
Task: "T034 health endpoint tests → backend/tests/api/new/test_health.py"
Task: "T035 POST /api/backtests tests → backend/tests/api/new/test_backtests.py"
Task: "T036 GET /api/runs/{id} tests → backend/tests/api/new/test_runs_detail.py"
Task: "T037 GET /api/runs/{id}/status tests → backend/tests/api/new/test_runs_status.py"
Task: "T038 GET /api/runs/{id}/trades tests → backend/tests/api/new/test_runs_trades.py"
Task: "T039 GET /api/runs/{id}/signals tests → backend/tests/api/new/test_runs_signals.py"
Task: "T040 GET /api/runs/{id}/journal tests → backend/tests/api/new/test_runs_journal.py"
# Run all → confirm RED → proceed to implementation
```

---

## Implementation Strategy

### MVP scope (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (the entire endpoint surface for the run lifecycle)
4. **STOP and VALIDATE**: Run T041 (full lifecycle integration test). Run `make api-dev` and exercise via curl. Confirm a real backtest run lands in Supabase.
5. MVP delivers SC-001, SC-003, SC-004, SC-005, SC-007, SC-008. SC-002 awaits US2; SC-006 awaits US4; SC-009 demonstrated in T043.

### Incremental delivery

1. Setup + Foundational → schema deployed, auth works, app skeleton importable.
2. + US1 → end-to-end backtest lifecycle over HTTP. **MVP**.
3. + US2 → SC-002 demonstrable; cross-user safety net in CI.
4. + US3 → strategy discovery + historical-data download.
5. + US4 → containerized; Feature 008 has its deployable artifact.
6. + Polish → docs, retention doc, analyze gate.

### Parallel-team strategy

After Phase 2 lands, US1 / US2 / US3 / US4 can be worked by different developers in parallel:

- **Dev A**: US1 (the largest, P1 MVP).
- **Dev B**: US2 (cross-user matrix — tests-only; uses Phase 2's RLS and auth foundation).
- **Dev C**: US3 (data download + strategies).
- **Dev D**: US4 (Dockerfile + fly.toml).

Conflicts are minimal: each user story owns its own router file and tests.

---

## Notes

- `[P]` = parallelizable: different files, no shared state, no dependencies on incomplete tasks.
- `[Story]` label maps task to user story for traceability through CI and PR descriptions.
- Every test task name starts with "Write failing test". The task is COMPLETE when the test exists AND has been observed to fail. The implementation task that follows turns it green.
- SQL migration files (T007-T010) are config-adjacent per the constitution's principle-IV exempt list. They're paired with integration tests because the constraints/policies/functions they encode are behavior that needs verification.
- The Q1 atomicity invariant (single-transaction finalize) is THE key new safety guarantee in this feature. T042 is the test that proves it works; T009 + T026 + T030 are the code that delivers it.
- The Q3 retry budget (3 attempts, 1s/2s/4s backoff) is the second-most-impactful new behavior — T057 enforces it.
- The Q4 env-var CORS is verified by tests in T034 / T035 implicitly (via the `Origin` header) and by an explicit test added to T034 if missing.
- The Q5 retention policy is config-only in this feature — T003 (config update) + T070 (doc) are the entire deliverable.
- Commit after each test/implementation pair lands green. Avoid lumpy "Phase 2 complete" mega-commits.
- Stop at any checkpoint to demo the partial result — this is a multi-story feature explicitly designed to ship in increments.
