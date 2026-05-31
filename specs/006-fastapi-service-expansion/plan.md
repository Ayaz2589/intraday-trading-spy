# Implementation Plan: Authenticated HTTP Backend for Backtests

**Branch**: `006-fastapi-service-expansion` | **Date**: 2026-05-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-fastapi-service-expansion/spec.md`

**Cross-feature design**: [`docs/migrations/2026-05-30-supabase-vercel-migration.md`](../../docs/migrations/2026-05-30-supabase-vercel-migration.md) — feature 2 of 4 in the cloud migration.

**Clarifications applied** (see [spec.md §Clarifications](./spec.md#clarifications)):
- Q1: `push_run` RPC extended to update `runs.status` to `finished` inside the same transaction — eliminates the post-push inconsistency window.
- Q2: All list endpoints use opaque cursor pagination (base64-encoded tuple). Stable under inserts/deletes.
- Q3: `POST /api/data/download` retries transient yfinance failures up to 3× with 1s/2s/4s backoff.
- Q4: CORS origins env-var-overridable; source has no hardcoded production origin.
- Q5: Data-retention policy declared in `config.yaml` only; pruning automation deferred.

## Summary

Expand the existing single-file static-serving FastAPI app (`backend/src/intraday_trade_spy/api/static_server.py` — currently a thin reader of `data/backtests/`) into a real authenticated HTTP backend. Validate Supabase JWTs locally against the project's JWKS, extract `user_id`, scope every database access by that `user_id` (in addition to the RLS already enforced by Feature 005), and expose the endpoints in the spec — `POST /api/backtests`, `GET /api/runs[/{id}[/status|/trades|/signals|/journal]]`, `POST /api/data/download`, `GET /api/strategies`, `GET /healthz`. Backtest jobs run as FastAPI `BackgroundTasks` (in-process). The existing pre-feature static endpoints stay reachable on a `/legacy/` prefix until Feature 007 retires them. Ship a `Dockerfile` + `fly.toml` so Feature 008 can deploy the same artifact without rebuild.

Per the 2026-05-30 clarification session: the `running → finished` state transition is performed in the SAME Postgres transaction as the data writes (new `push_run_finalize(jsonb)` RPC extending Feature 005's atomic write); list endpoints use opaque cursor pagination; yfinance downloads retry transient failures up to 3 times with exponential backoff; CORS origins are env-var-overridable (no hardcoded production origins); a data-retention policy is declared in config but not enforced in this feature.

## Technical Context

**Language/Version**: Python 3.11 (unchanged from Features 001-005).

**Primary Dependencies**:
- Existing: `fastapi>=0.115`, `uvicorn>=0.32`, `pydantic>=2.6`, `supabase>=2.7`, `pandas>=2.2`, `yfinance>=0.2.40`
- New: `pyjwt[crypto]>=2.9` (verify Supabase-issued JWTs locally), `httpx>=0.27` (promoted from dev to runtime dep for JWKS fetch)
- Dev (new): none — `pytest-asyncio>=0.24` from Feature 005 covers async handlers

**Storage**:
- Supabase Postgres (Feature 005's schema) — read/write via `intraday_trade_spy.storage.SupabaseStorageClient`
- Supabase Storage `raw-data` bucket — written by the historical-data download endpoint
- No new persistent storage introduced

**Testing**:
- `pytest` with FastAPI's `TestClient` (offline, mocks Supabase via the existing `unittest.mock` patterns in Feature 005)
- `@pytest.mark.integration` tests that hit a local Supabase via the existing `tests/storage/conftest.py` fixtures
- `@pytest.mark.api` marker preserved for the existing Feature 003 static-server tests

**Target Platform**:
- Development: macOS / Linux (uvicorn local), reachable on `http://localhost:8000`
- Production-readiness: a single Docker image runnable on Fly.io (Feature 008 deploys; this feature ships the image)

**Project Type**: Web service evolution — the existing monorepo gains expanded code under `backend/src/intraday_trade_spy/api/` and a new `backend/Dockerfile` + `backend/fly.toml`. No new top-level project.

**Performance Goals**:
- POST `/api/backtests` returns in <1s regardless of run duration (SC-003)
- Health check returns in <200ms (SC-005)
- End-to-end "start → poll → finished" on the bundled fixture in <60s (SC-001)
- 5 concurrent in-flight backtests per user (FR-016, SC-009)

**Constraints**:
- Service-role key is NEVER accepted from clients (FR-014)
- Pre-feature static endpoints stay reachable so Feature 003's frontend keeps working (FR-009, SC-007)
- Backtest crash / process restart cannot leave a run in `running` indefinitely (FR-015)
- No half-written cloud data on any failure path (FR-011, SC-008) — finalized via single-transaction `push_run_finalize` RPC (clarification Q1: status update lives inside the same Postgres transaction as the data writes)
- CORS production origins MUST be env-var-overridable, NOT hardcoded (FR-017, clarification Q4)
- Failed yfinance fetches retry up to 3× with exponential backoff (FR-008, clarification Q3)
- Data-retention policy is DECLARED in config but NOT enforced in this feature (FR-019, clarification Q5)

**Scale/Scope**:
- Single FastAPI instance, single Uvicorn worker (in-process BackgroundTasks would lose cross-worker visibility)
- 5 concurrent backtests per user (configurable)
- 9 new endpoints + 1 health check + existing legacy endpoints under `/legacy/` prefix

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source of truth: `.specify/memory/constitution.md` (v1.1.0). For each principle below, state which parts of this feature touch it and prove non-violation.

| # | Principle | Touched? | How this plan complies |
|---|-----------|----------|------------------------|
| I | SPY-Only Instrument (NON-NEGOTIABLE) | yes | `POST /api/backtests` body accepts `config_name` + optional `data_csv_url` only — never a `symbol`. Strategy registry pins `symbol = SPY` (Feature 005). Historical-data download hardcodes SPY. Test asserts a body containing `symbol` is either ignored or rejected with 400. |
| II | Long-Only, Rule-Based v1 (NON-NEGOTIABLE) | yes | `GET /api/strategies` returns registry rows filtered to `enabled = true`. No endpoint accepts `direction` / `kind` — both are inherited from the registered strategy. |
| III | Risk Manager Has Absolute Veto (NON-NEGOTIABLE) | no (engine unchanged) | Backtests still run via `BacktestEngine.run()` which calls the risk manager exactly as in Feature 005. The API layer is pure orchestration — no path bypasses strategy → risk → broker → journal. |
| IV | Test-First Everywhere (NON-NEGOTIABLE) | yes | Every implementation task in `tasks.md` is preceded by a failing-test task. New code under `backend/src/intraday_trade_spy/api/` and `backend/src/intraday_trade_spy/auth/` is in-scope. Test layout: `tests/api/new/` for unit + contract, `tests/api/integration/` for end-to-end. |
| V | Paper-First, Live Trading Disabled by Default (NON-NEGOTIABLE) | yes | Every `configs` row referenced by the API inherits `live_auto_enabled = FALSE` from the DB CHECK constraint. No API endpoint accepts a `live_auto_enabled` field. Feature 005's Pydantic validator is reused. |
| VI | Educational UI: Every Concept Is Explained | no | No UI in this feature. Feature 007 carries the UI obligations. |
| VII | Journal Everything | yes | Every API operation that creates / completes / fails a run emits a `journal_events` row (`kind` ∈ `api_request_received`, `backtest_started`, `backtest_finished`, `backtest_failed`, `data_download_started`, `data_download_finished`). The Feature 005 schema's CHECK list does NOT currently include these; a PATCH migration `0050_journal_event_kinds.sql` extends the CHECK. All cloud journal writes pass through `JournalLogger` (single-writer rule preserved). |

**Engineering standards check:**

- [x] Timezone is `America/New_York` for any new time logic; `clock.py` is consulted, not reimplemented. *(No new time-of-day logic.)*
- [x] Any new limits, thresholds, or session times live in `backend/config/config.yaml`, not in source. *(New `api:` section: `max_concurrent_runs_per_user: 5`, `polling_status_max_age_minutes: 15`, `health_check_timeout_s: 5`, `cors_allow_origins`, `cors_allow_methods`, `cors_allow_headers`, plus `data_download.retry_attempts: 3`, `data_download.retry_backoff_seconds: [1, 2, 4]`, `retention.failed_runs_days: 90`, `retention.audit_events_days: 30`, `retention.failed_downloads_days: 30`.)*
- [x] Backend code is Python ≥3.11 / FastAPI / Pydantic v2 / pytest. *(Confirmed.)*
- [x] Frontend code is React + TypeScript + Vite + Tailwind. *(N/A in this feature.)*

**Constitutional amendment required**: none. Feature 005's PATCH 1.1.0 → 1.1.1 (cloud configs alongside YAML) covers this feature too.

All NON-NEGOTIABLE principles honored. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/006-fastapi-service-expansion/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (lightweight — no new tables, one new migration)
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── endpoints.md     # Every endpoint's request/response/error matrix
│   ├── jwt-auth.md      # JWT verification + user_id extraction contract
│   └── background-tasks.md  # Run-lifecycle state machine + crash-recovery
└── tasks.md             # Phase 2 output (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── src/intraday_trade_spy/
│   ├── api/                            # EXISTING module — extended
│   │   ├── __init__.py                 # exposes `app`
│   │   ├── app.py                      # NEW — top-level FastAPI app + middleware + router registration
│   │   ├── deps.py                     # NEW — Depends() helpers (auth_user_id, get_storage_client)
│   │   ├── errors.py                   # NEW — typed HTTP error responses + audit logging
│   │   ├── lifecycle.py                # NEW — run-state machine + BackgroundTasks adapter
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── backtests.py            # POST /api/backtests
│   │   │   ├── runs.py                 # GET /api/runs/*
│   │   │   ├── strategies.py           # GET /api/strategies
│   │   │   ├── data.py                 # POST /api/data/download
│   │   │   └── health.py               # GET /healthz (unauthenticated)
│   │   ├── schemas.py                  # NEW — Pydantic request/response models
│   │   └── static_server.py            # EXISTING — moved behind /legacy/ prefix in app.py
│   ├── auth/                           # NEW — JWT verification
│   │   ├── __init__.py
│   │   ├── jwks.py                     # JWKS fetch + cache
│   │   └── token.py                    # verify_jwt(token) -> user_id
│   ├── storage/                        # FEATURE 005 — unchanged
│   ├── backtest/                       # unchanged
│   ├── broker/                         # unchanged
│   ├── cli/                            # unchanged
│   ├── data/                           # unchanged
│   ├── journal/                        # unchanged
│   ├── risk/                           # unchanged
│   └── strategy/                       # unchanged
├── db/migrations/
│   └── 0050_journal_event_kinds.sql    # NEW — extends journal_events.kind CHECK list (api_* + data_* values)
├── Dockerfile                          # NEW
├── fly.toml                            # NEW — Feature 008 deploys this
├── pyproject.toml                      # MODIFIED — adds pyjwt[crypto], promotes httpx to runtime
├── config/
│   └── config.yaml                     # MODIFIED — adds `api:` section
└── tests/
    ├── api/                            # EXISTING (Feature 003) — stays green
    │   ├── (existing static_server tests)
    │   └── new/                        # NEW — unit + contract tests
    │       ├── test_health.py
    │       ├── test_auth.py
    │       ├── test_backtests.py
    │       ├── test_runs.py
    │       ├── test_strategies.py
    │       └── test_data.py
    ├── api/integration/                # NEW — end-to-end against local Supabase
    │   ├── conftest.py                 # TestClient + supabase fixtures
    │   ├── test_run_lifecycle.py
    │   ├── test_cross_user_isolation.py
    │   └── test_data_download.py
    ├── auth/                           # NEW
    │   ├── test_jwks.py
    │   └── test_token_verify.py
    └── (existing tests — unchanged)

frontend/                               # UNCHANGED
```

**Structure Decision**: The existing monorepo layout continues. The `api/` submodule refactors from a single `static_server.py` into a router-per-resource layout (`routers/backtests.py`, `routers/runs.py`, …) — small files, one responsibility each. A new `auth/` submodule isolates JWT verification.

The pre-feature `static_server.py` relocates behind a `/legacy/` URL prefix and stays callable so Feature 003's frontend continues to work without changes. Removing it is Feature 007's job.

## Complexity Tracking

No NON-NEGOTIABLE principle is violated; this table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| *(none)* | | |
