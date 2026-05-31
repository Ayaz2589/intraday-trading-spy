# Feature Specification: Authenticated HTTP Backend for Backtests

**Feature Branch**: `006-fastapi-service-expansion`

**Created**: 2026-05-30

**Status**: Draft

**Input**: User description: "FastAPI service expansion for the SPY backtest app — second of four sequential features in the cloud migration (full design: `docs/migrations/2026-05-30-supabase-vercel-migration.md`). Feature 005 delivered the data layer + a CLI push flag; this feature turns the tiny static-file server into a real, authenticated HTTP backend so any user (not just the operator-developer) can trigger and inspect backtests over the network."

## Clarifications

### Session 2026-05-30

- Q: When a backtest's results write succeeds but the subsequent `runs.status` UPDATE fails (e.g., process crash between the two), how should the system reconcile? → A: Combine into one transaction — extend the atomic push RPC to also flip `runs.status` to `finished` inside the same Postgres transaction. Eliminates the inconsistency window.
- Q: What pagination model should the list endpoints (`/api/runs`, `/api/runs/{id}/trades`, `/api/runs/{id}/signals`, `/api/runs/{id}/journal`) use? → A: Opaque token cursors. The server returns a `next_cursor` (base64-encoded tuple of the row's natural ordering key + id); clients treat it as a black box and pass it back unchanged. Stable under concurrent inserts/deletes.
- Q: How should the asynchronous yfinance download endpoint react to yfinance failures (network errors, Yahoo throttling 429s, "no data" responses, etc.)? → A: Bounded retry with exponential backoff — up to 3 attempts (1s → 2s → 4s) on transient errors (network, 5xx, 429); fail immediately on non-transient errors (invalid date range, "no data" empty result). The retry happens inside the background job, so the user only sees the final state.
- Q: How should production CORS origins be configured for Feature 008's deployment? → A: Env-var-overridable list. `cors_allow_origins` defaults from `backend/config/config.yaml` (localhost variants for dev); `CORS_ALLOW_ORIGINS` env var (comma-separated) overrides at runtime. `CORS_ALLOW_ORIGIN_REGEX` env var matches Vercel preview branches. Standard 12-factor pattern.
- Q: What data retention policy applies to failed runs, completed audit events, and failed download jobs? → A: Document a retention policy in `config.yaml` (defaults: failed runs eligible for deletion after 90 days; `api_request_received` audit events after 30 days; failed download jobs after 30 days) but DO NOT implement the pruning automation in this feature. Enforcement (scheduled job, manual sweep, etc.) lands in a later feature or as a Supabase pg_cron job in Feature 008.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Start a backtest run and view its results (Priority: P1)

As an authenticated user holding a valid session token, I can trigger a backtest run from any HTTP client and follow it to completion without needing access to the operator-developer's laptop:

- I send a request to start a backtest naming a saved configuration.
- The service accepts immediately (the run may take minutes) and returns a stable identifier I can poll.
- I poll a status endpoint until the run reports finished.
- I then fetch the run's summary, trades, signals (executed and rejected), and journal events — each scoped to my account.

**Why this priority**: This is the entire reason the cloud migration exists. Without a network-callable start-a-backtest path, multi-user access is impossible and Feature 007's web UI cannot exist. P1 = the MVP.

**Independent Test**: From a fresh terminal with a valid session token in hand, run `curl` against the running service. Trigger a backtest on the bundled fixture; poll until finished; fetch the summary. Confirm the returned run id is also visible in the cloud database and the summary numbers match a local backtest of the same fixture (within float-precision tolerance).

**Acceptance Scenarios**:

1. **Given** I have a valid session token, **When** I request a new backtest naming an existing saved configuration, **Then** the service returns a stable run id immediately and the run begins executing in the background.
2. **Given** a run is in progress, **When** I poll its status endpoint, **Then** I receive one of: `queued`, `running`, `finished`, `failed` — with the final state reached within the configured timeout for a typical run.
3. **Given** my run has finished, **When** I fetch the run's detailed view, **Then** I receive every summary metric (P&L, win rate, trade count, signal counts, rejection breakdown).
4. **Given** my run has finished, **When** I fetch trades / signals / journal events for the run, **Then** I receive the same data that would have been written to the cloud by a local CLI push (within float-precision tolerance) and rejected signals appear alongside executed ones as first-class records.
5. **Given** my session token is missing or invalid, **When** I attempt to start a backtest, **Then** the service refuses the request with a clear unauthorized response and writes no data.

---

### User Story 2 — Cross-user isolation (Priority: P2)

As an authenticated user, I can be certain that no list, detail, trade, signal, or journal-event endpoint will ever return another user's data — and I cannot create, modify, or delete another user's data even if I know its identifier:

- Listing my runs returns only my runs.
- Fetching a specific run by id that belongs to another user is refused (not silently returned, not partially returned).
- Cross-user write attempts are refused at the API boundary even when the underlying data layer would also refuse them.

**Why this priority**: Cross-user isolation is a correctness invariant of any multi-tenant product. Without it, the system is unsafe to expose to more than one user. Foundational for everything else.

**Independent Test**: An automated test seeds two users (A and B), each with a few runs. It then exercises every read endpoint with A's token while supplying B's run identifiers in the path; every such request returns "not found" or "forbidden." It also tries every write endpoint targeting B's resources with A's token; all are refused. Direct database introspection confirms no data leaked across users.

**Acceptance Scenarios**:

1. **Given** two users with disjoint runs, **When** user A lists runs, **Then** the response contains only user A's runs.
2. **Given** two users with disjoint runs, **When** user A requests user B's run by its id, **Then** the response is "not found" (the system MUST NOT confirm or deny existence of another user's run).
3. **Given** two users, **When** user A attempts to start a backtest naming a config that belongs to user B, **Then** the request is refused.

---

### User Story 3 — Discover available strategies and download historical data (Priority: P3)

As an authenticated user, I can discover what strategies are available, and I can request that historical SPY data be downloaded into shared storage for use by future runs:

- I can list registered strategies, see their names + descriptions, and use that information to pick which strategy to run.
- I can request a historical-data download for a date range; the service accepts immediately, fetches in the background, and stores the result so any future backtest can use it.

**Why this priority**: Strategy discovery is needed for any reasonable UI that lets users choose a strategy (Feature 007). Historical-data download is a quality-of-life endpoint — users no longer need shell access to fetch yfinance data.

**Independent Test**: Listing strategies returns at least the seeded strategy. Requesting a date-range download with a small range completes within a reasonable budget and the data is available for the next backtest without further user action.

**Acceptance Scenarios**:

1. **Given** I am authenticated, **When** I list strategies, **Then** I receive every enabled strategy with its display name, description, symbol, direction, and kind.
2. **Given** I request a historical-data download for a date range, **When** the download completes, **Then** the data is available in shared storage and queryable by my next backtest.

---

### User Story 4 — Deployability for an operator (Priority: P4)

As a developer-operator, I can build a self-contained container image of the service and run it locally against my cloud database — that same image is what Feature 008 will deploy to a production host. No environment-specific build steps are required.

**Why this priority**: Containerization is the bridge between this feature (the code) and Feature 008 (the deployment). Without it, "we have a working service" doesn't translate into "we can put it in front of real users."

**Independent Test**: From a fresh checkout, run a single documented build command to produce a container image; run a single documented run command to start the container locally against the cloud database; confirm a backtest can be triggered against the running container.

**Acceptance Scenarios**:

1. **Given** a fresh repository checkout, **When** I run the documented build command, **Then** I obtain a working container image without manual intervention.
2. **Given** I have the container image and valid cloud credentials, **When** I run the documented start command, **Then** the service is reachable on a predictable local port and accepts requests.

---

### Edge Cases

- **Long-running backtest crashes mid-run**: The service process is restarted (deploy, OOM, etc.) while a backtest is running. The system MUST mark the orphaned run as `failed` on next read (or on a sweep), never `running` indefinitely. The user MUST be able to start a fresh run without operator intervention.
- **Concurrent runs by the same user**: A user starts a second backtest while their first is still running. Both runs proceed independently and are visible in their list of runs. Resource caps (max concurrent runs per user) are documented and enforced.
- **Slow / unreachable yfinance during download**: A historical-data download takes longer than expected or returns an error. The service reports the failure clearly to the user (via the run's status or a job-status endpoint) without leaking partial data into shared storage.
- **Token expires mid-poll**: A user's session token expires while they're polling. The next request returns "unauthorized"; they refresh their session and resume polling with no loss of data.
- **Service-role credential accidentally exposed**: The service MUST never accept the privileged service credential from any client — it is a server-side-only secret. Attempting to send it as a bearer token MUST NOT escalate privileges.
- **Existing local-dev path is broken by the new endpoints**: The previously-existing static-file endpoints used by Feature 003's frontend MUST continue to respond as they did before, until Feature 007 explicitly migrates the frontend.
- **CORS misconfiguration in development**: The service MUST be reachable from a local frontend running on a typical Vite-default development port without manual CORS surgery.
- **Background-task queue saturation**: When the in-process background-task capacity is reached, new run requests are either queued (preferred) or rejected with a clear "service is busy, try again" response — never silently dropped.
- **User triggers a run with a non-existent config name**: The request is refused with a clear, actionable error naming what's missing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The service MUST authenticate every protected request by verifying a session token issued by the cloud authentication provider. Requests without a valid token MUST be refused with an unauthorized response.
- **FR-002**: The service MUST scope every read and write to the authenticated user. A user MUST NEVER be able to observe or modify another user's data through any endpoint.
- **FR-003**: The service MUST expose an endpoint to start a new backtest run. The endpoint MUST accept the request immediately (well under the time a backtest takes to execute) and return a stable identifier the caller can poll.
- **FR-004**: The service MUST expose endpoints to list a user's runs (newest-first, paginated) and to fetch a single run's detail by its identifier. Pagination MUST use opaque cursor tokens that are stable under concurrent inserts and deletes (clarification 2026-05-30 / Q2): a list response includes a `next_cursor` field (or `null` when no more results), and the client passes that token unchanged to fetch the next page.
- **FR-005**: The service MUST expose a status endpoint that returns one of a small documented set of states (`queued`, `running`, `finished`, `failed`) so the caller can poll until a run completes.
- **FR-006**: The service MUST expose endpoints to fetch the trades, signals (executed AND rejected), and journal events of a specific run.
- **FR-007**: The service MUST expose an endpoint to list available strategies from the registry.
- **FR-008**: The service MUST expose an endpoint to trigger a historical-data download for a date range. The download MUST complete asynchronously; the caller MUST be able to discover when the data is ready. Transient upstream failures (network errors, throttling, 5xx) MUST be retried up to 3 times with exponential backoff (1s → 2s → 4s) inside the background job before the job is marked `failed` (clarification 2026-05-30 / Q3). Non-transient failures (invalid date range, "no data" empty result) MUST NOT be retried.
- **FR-009**: The service MUST preserve the existing pre-feature endpoints used by the existing local-dev frontend until Feature 007 explicitly removes them. (This feature is purely additive on the API surface.)
- **FR-010**: Backtests started via the API MUST produce the same data — runs, trades, signals, journal events — as the existing CLI push path, scoped to the authenticated user.
- **FR-011**: A backtest that fails (engine error, validation error, etc.) MUST report `failed` in its status and MUST surface an actionable error message; the failure MUST NOT leave the user's data in a half-written cloud state. The transition from `running` to `finished` MUST be atomic with the writes that land the run's trades, signals, and journal events — committed as a single transaction (clarification 2026-05-30 / Q1), so a process crash mid-finalization cannot leave a run with persisted data and `status = 'running'`.
- **FR-012**: The service MUST log every API operation that touches a run, trade, signal, or journal event into the existing journal — including request received, backtest started, backtest finished, backtest failed — so the system's audit trail is complete (constitution principle VII).
- **FR-013**: The service MUST be packagable as a self-contained container image using a single documented build command, with no environment-specific build inputs other than standard cloud credentials provided at run time.
- **FR-014**: The service MUST refuse to accept the privileged service credential from any client. Attempting to send it as a bearer token MUST NOT escalate the request beyond ordinary user privileges.
- **FR-015**: The service MUST tolerate restarts: an in-flight backtest interrupted by a service restart MUST end up in `failed` status (not `running` indefinitely), so the user can start a fresh run without operator intervention.
- **FR-016**: The service MUST allow a documented per-user cap on concurrent in-flight backtest runs. Requests beyond the cap MUST be refused with a clear error rather than silently dropped.
- **FR-017**: When run locally for development, the service MUST be reachable from the existing local frontend (Feature 003) on its default development port without manual cross-origin configuration on the user's side. Production cross-origin behavior MUST be configurable via environment variables — a comma-separated `CORS_ALLOW_ORIGINS` overrides the dev defaults at runtime, and an optional `CORS_ALLOW_ORIGIN_REGEX` matches deployment-platform preview-branch domains (clarification 2026-05-30 / Q4). The source code MUST NOT hardcode any production origin.
- **FR-018**: The service MUST surface its own health: a non-authenticated health-check endpoint MUST report whether the service is up and whether it can reach the cloud database.
- **FR-019**: The service MUST document a data-retention policy in configuration: failed runs and their dependent rows are eligible for deletion after 90 days; `api_request_received` audit events after 30 days; failed download jobs after 30 days (clarification 2026-05-30 / Q5). Enforcement of the policy (pruning automation) is DEFERRED to a later feature; this feature only ships the policy declaration so downstream operators can configure / build enforcement consistently.

### Key Entities

- **Backtest run** *(extends Feature 005's `Run`)*: Gains an API-side lifecycle: `queued` → `running` → `finished` / `failed`. The lifecycle is observable via the status endpoint; the underlying database row exists from the moment of the start request, so the run can always be looked up by id.
- **Saved config** *(unchanged from Feature 005)*: Referenced by name when starting a backtest. Must already exist for the authenticated user before a run can be started against it.
- **Data download job**: Represents an asynchronous yfinance fetch for a date range, scoped to the authenticated user. Has its own status (`queued`, `running`, `finished`, `failed`) so the caller can wait for the data before triggering a backtest against it.
- **API audit event** *(extends Feature 005's `JournalEvent`)*: A journal-event variant whose `kind` covers API lifecycle (`api_request_received`, `backtest_started`, `backtest_finished`, `backtest_failed`, `data_download_started`, `data_download_finished`). Stored in the same `journal_events` stream so the audit trail is unified.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An authenticated user can start a backtest via the API and reach a `finished` status on the bundled fixture within 60 seconds of issuing the start request, end-to-end, from any HTTP client.
- **SC-002**: 100% of cross-user access attempts (read or write, against any endpoint) are refused with the correct response code. Verified by an automated test that exercises every endpoint with mismatched-user tokens.
- **SC-003**: An authenticated user receives a response from the start-a-backtest endpoint within 1 second of issuing the request — independent of how long the backtest itself takes.
- **SC-004**: The data a user fetches via the API (run, trades, signals, journal events) matches what the existing CLI push path produces for the same configuration and input data, within float-precision tolerance.
- **SC-005**: An unauthenticated health-check returns a result indicating service-up + database-reachable in under 200 milliseconds.
- **SC-006**: A developer-operator can produce a working container image from a fresh checkout in under 5 minutes following the documented build steps.
- **SC-007**: The pre-existing endpoints used by Feature 003's frontend continue to respond identically after this feature ships — verified by the existing Feature 003 test suite passing unchanged.
- **SC-008**: A backtest that crashes (engine error, missing data, etc.) reports `failed` status to the caller within 5 seconds of the crash, with an actionable error message — and leaves zero half-written data in the user's cloud rows.
- **SC-009**: When the in-process background-task capacity is reached, the 6th concurrent run request (with capacity = 5) is refused with a clear, machine-readable response — no silent drops.

## Assumptions

- The cloud database, authentication provider, and storage layer are the ones provisioned by Feature 005 and remain reachable from wherever the service runs.
- The authenticated user has at least one saved configuration in their account (created either via Feature 005's CLI push path or via a future API endpoint not in scope for this feature).
- A "backtest run" duration is bounded by what an in-process background task can reasonably hold open (single-digit minutes per run for the MVP). Multi-hour or queued-for-tomorrow workloads are out of scope and will be added in a later feature if needed.
- Production deployment specifics (host, region, secret manager, DNS, monitoring) are out of scope and will be addressed in Feature 008. This feature delivers a deployable artifact; it does not deploy it.
- Real-time progress (sub-second updates via push/streaming) is out of scope. Polling at 1-2 second intervals is sufficient for the v1 user experience.
- The existing CLI push path (Feature 005's `--push-to-supabase`) continues to work alongside the new API; users may push via either route.
- The web frontend's specifics (login UI, token storage, routing) are out of scope and arrive in Feature 007. This feature is callable today by any client that can hold a valid session token (curl, Postman, integration tests).

## Out of Scope

The following items belong to later features and MUST NOT be addressed here:

- Frontend changes — login UI, routing, auth-token storage, UI-side data fetching (Feature 007).
- Production deployment of the service (Feature 008).
- A persistent job queue (Redis / RQ / Sidekiq). In-process background tasks are sufficient for the MVP.
- Real-time progress streaming (Server-Sent Events / WebSocket). Polling suffices.
- Removal of the pre-existing local-dev endpoints. They are removed in Feature 007 when the new endpoints replace them.
- Multi-strategy live-trading paths — `live_auto_enabled` remains pinned `FALSE` everywhere per constitution principle V.
- Endpoints to create/update/delete saved configs. Configs are created via the CLI push path (Feature 005) in this feature; UI-driven config CRUD lands in Feature 007.
- Rate limiting, abuse prevention, audit-log export, billing instrumentation. Important eventually; not needed for the MVP.
- **Pruning / enforcement of the data-retention policy declared in FR-019.** This feature ships the policy declaration in config; the actual delete job is deferred to a later feature or to Feature 008's deployment (e.g., as a Supabase pg_cron job).
