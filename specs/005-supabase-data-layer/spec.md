# Feature Specification: Cloud-Persisted Backtest Storage with Multi-User Access

**Feature Branch**: `005-supabase-data-layer`

**Created**: 2026-05-30

**Status**: Draft

**Input**: User description: "Supabase data layer for the SPY backtest app — first of four sequential features migrating the app from local-only single-user to a multi-user web app on Supabase + Fly.io + Vercel. See `docs/migrations/2026-05-30-supabase-vercel-migration.md` for the cross-feature architectural design."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Push a backtest run to cloud storage (Priority: P1)

As a developer-operator running the existing backtest CLI on my own machine, I can opt-in to writing every run's results to a shared cloud database, scoped to my own account, so that:

- I have a durable, queryable history of every run I've executed, surviving laptop changes
- I can revisit a run weeks later without having the original local files
- Future features (a web UI, multi-user dashboards) can read this same history without needing my laptop

**Why this priority**: Without persistent multi-user storage, every later feature (FastAPI service, web UI, deployment) is blocked. This is the foundation. The CLI keeps working locally as it does today; the cloud sink is purely additive in this feature.

**Independent Test**: Run a single backtest with the new opt-in flag. Inspect the cloud database directly (Supabase web UI or `psql`) and confirm the run's summary metrics, every executed trade, every emitted signal (including rejected ones), and every journal event are present. Re-read the data via the CLI's read path and confirm it matches the source files byte-for-byte (within float-precision tolerance).

**Acceptance Scenarios**:

1. **Given** a backtest has completed locally and the operator has set the cloud credentials, **When** the operator re-runs the backtest with the opt-in flag, **Then** the run row, every trade, every signal (executed and rejected), and every journal event are written to cloud storage and tagged with the operator's account.
2. **Given** a backtest pushed to the cloud, **When** the operator queries the cloud database for runs belonging to their account, **Then** the operator sees the run and can drill into its trades, signals, and journal events.
3. **Given** the cloud credentials are missing or invalid, **When** the operator runs a backtest with the opt-in flag, **Then** the backtest still completes locally and exits with a clear error explaining that the cloud push failed without losing any local data.
4. **Given** a previously pushed run, **When** the operator runs the same backtest again, **Then** a new run row is created (every run is a fresh row — no implicit overwrite or merge).
5. **Given** a backtest is run **without** the opt-in flag, **Then** the cloud database is not touched and the existing local-only workflow is unchanged.

---

### User Story 2 — Sign in with email OTP + MFA (Priority: P2)

As an operator, I can sign in to the cloud platform using my email address (one-time code) plus a second factor (authenticator app), so that:

- My account is protected even if my email is compromised
- I never have to remember or rotate a password
- The credentials I use match what the future web UI will accept (no re-onboarding when the UI ships)

**Why this priority**: Auth must exist before user-scoped storage has any meaning. P2 because the CLI in this feature uses a service-role key (P1 doesn't depend on a user signing in via the dashboard); but auth needs to be configured and tested now so feature 007 has a working foundation.

**Independent Test**: From the cloud platform's web dashboard, sign up with a fresh email. Receive a 6-digit code, enter it, enroll an authenticator app (e.g., Google Authenticator), then sign out and sign back in using email code + authenticator code. Confirm sign-in is blocked if either factor is missing or wrong.

**Acceptance Scenarios**:

1. **Given** a fresh email address, **When** the operator initiates sign-up, **Then** a 6-digit code is emailed and entering it correctly creates the account.
2. **Given** a newly-created account, **When** the operator signs in for the first time, **Then** they are required to enroll a TOTP authenticator before reaching any protected resource.
3. **Given** an enrolled account, **When** the operator signs in, **Then** both the email code and the authenticator code are required and either being wrong rejects the sign-in.
4. **Given** an enrolled account, **When** the operator loses their authenticator device, **Then** there is a documented recovery procedure (backup codes saved at enrollment, or an out-of-band reset path) so they aren't permanently locked out.

---

### User Story 3 — Verify multi-user isolation (Priority: P3)

As a developer auditing the system, I can run automated tests that prove no user can read or modify another user's runs, trades, signals, journal events, or saved configs, so that:

- I can ship the system without manual reasoning about cross-user leaks
- Future schema changes (new tables, new columns) are caught if they introduce a leak

**Why this priority**: Cross-user isolation is a correctness invariant of the multi-user product; without automated proof, a regression in any later feature could silently leak one user's research to another. P3 because the test suite is built after the schema and CLI changes (P1 + P2) are in place.

**Independent Test**: A test seeds two synthetic users, each with their own runs, trades, signals, and journal events. The test then attempts every cross-user access (read another user's run, list another user's trades, modify another user's config, etc.) using each user's credentials. Every attempt is denied. The shared historical-bars cache is readable by both users (because it is not user-scoped) but is not writable by either of them.

**Acceptance Scenarios**:

1. **Given** two users with disjoint runs/trades/signals/journal_events/configs, **When** user A queries for "all runs", **Then** only user A's runs are returned.
2. **Given** two users, **When** user A attempts to update user B's run (e.g., via a write call referencing user B's run ID), **Then** the write is denied.
3. **Given** an unauthenticated request, **When** any storage operation is attempted on any user-scoped table, **Then** the operation is denied.
4. **Given** an authenticated user, **When** they query the shared historical-bars cache, **Then** they can read but not write or delete rows.

---

### Edge Cases

- **Partial-failure push**: A backtest produces results locally, but the cloud push fails partway through (e.g., the network drops between writing the run row and writing the trades). The system must not leave a half-uploaded run in the cloud. Either the entire run is committed or nothing is — and the operator gets a clear error.
- **Duplicate run prevention vs. retries**: The operator runs the same backtest twice intentionally (legitimate re-run) vs. accidentally retrying a failed push. The system must not silently dedupe legitimate re-runs; the push is identified by a per-run client-generated identifier that the operator can replay safely if a retry is needed.
- **Schema applied to a non-empty database**: When schema migrations are applied to a cloud database that already has data (in this feature it should be empty, but the test must prove the migration is idempotent for safety).
- **Service-role key misuse**: The service-role key is the only credential capable of bypassing user isolation. It must never be embedded in the frontend, the CLI's read path, or any user-facing surface. Documentation must make this clear, and tests verify that the CLI's interactive command surface never accepts or surfaces the key.
- **MFA enrollment skipped**: A user signs in, dismisses the MFA enrollment prompt, and tries to perform a protected action. They are blocked until MFA is enrolled.
- **MFA device lost without backup codes**: A user loses their authenticator and never saved backup codes. The system must have a documented recovery path (admin-driven reset) — the recovery does not need to be self-serve in this feature.
- **Large run with many signals**: A backtest emits thousands of signals (a real possibility on a multi-month range). The push must complete within the operator's reasonable patience and not time out the entire backtest.
- **CSV columns or schema drift over time**: A future indicator adds a new column to a signal. The schema must allow extension without rewriting older rows.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a cloud-backed storage layer that holds runs, trades, signals (executed and rejected), journal events, configs, a strategy registry, and a shared historical-bars cache.
- **FR-002**: System MUST scope every user-owned row (runs, trades, signals, journal events, configs) to the user who created it, and prevent any read or write access to another user's rows.
- **FR-003**: The shared historical-bars cache MUST be readable by any authenticated user and writable only by the trusted service role.
- **FR-004**: System MUST authenticate operators using an email one-time code plus a second factor (authenticator-app TOTP). On a new account's first sign-in, MFA enrollment MUST be required before any protected action.
- **FR-005**: The existing backtest CLI MUST accept an opt-in flag that, when provided, writes the complete run output (run row, trades, signals, journal events) to cloud storage scoped to the operator's account. When the flag is NOT provided, the CLI MUST behave exactly as it does today (no cloud calls, no behavior change).
- **FR-006**: The opt-in cloud push MUST be atomic from the operator's perspective: either the full run lands or nothing lands. Partial uploads MUST be detectable and recoverable (no orphaned data in the cloud).
- **FR-007**: System MUST surface a clear, actionable error message when the cloud push fails for any reason (auth failure, network error, validation failure) without losing the local backtest results.
- **FR-008**: System MUST treat rejected signals as first-class records — every rejected signal MUST be written with full context (reason, indicator values at the moment of rejection) just like executed signals. (Constitution principle VII.)
- **FR-009**: System MUST persist the constitutional `live_auto_enabled: false` flag as the default for every newly-created config in cloud storage. (Constitution principle V.)
- **FR-010**: System MUST seed the strategy registry with the existing `vwap_pullback_long` strategy as the only initial registered strategy.
- **FR-011**: System MUST allow adding a new strategy to the registry without changing any existing user's data or invalidating any existing run.
- **FR-012**: System MUST provide a documented, automated way to provision a fresh cloud database from scratch (apply all schema migrations, seed the registry, configure auth, create storage buckets) in under 10 minutes by a single operator.
- **FR-013**: System MUST keep the local backtest CLI's existing behavior, file layout, and output format intact — the cloud sink is purely additive.
- **FR-014**: System MUST log every successful and failed cloud push to the existing journal, so the operator's local record reflects what happened regardless of cloud availability.
- **FR-015**: System MUST expose a documented service-role credential mechanism for the CLI to authenticate against the cloud. The service-role credential MUST NOT be checked into version control and MUST NOT be acceptable on any user-facing surface.

### Key Entities

- **Strategy**: A named, registered backtest strategy. The MVP ships with one strategy (`vwap_pullback_long`). Adding new strategies in the future MUST be additive (new row + new module) and MUST NOT invalidate existing runs that referenced earlier strategy versions.
- **Config**: A saved backtest configuration owned by a user. References exactly one strategy. Includes all the magic-number parameters that today live in the repo's `config.yaml`. Carries the constitutional `live_auto_enabled` flag, defaulting to `false`.
- **Run**: One instance of running a backtest. Owned by a user. References the config and strategy used, the date range, and the resulting summary metrics (P&L, win rate, Sharpe, max drawdown). Has a stable identifier that the operator can use to retrieve trades, signals, and journal events for the run.
- **Trade**: An executed trade within a run. References the run. Records entry/exit prices, sizes, P&L, the signal that produced it.
- **Signal**: A candidate signal emitted by a strategy during a run. May be executed OR rejected. Every signal — regardless of outcome — is persisted with the full reason and indicator context. Rejected signals are queryable as first-class records.
- **Journal Event**: A timestamped event from a run that isn't a signal or trade: force-flat exit, risk decision, error, lifecycle event, push success/failure. The catch-all "what happened" stream.
- **Bar (shared cache)**: A historical 5-minute SPY bar. Not user-scoped. Read by any authenticated user; written only by the trusted service role to avoid duplicate yfinance fetches.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A backtest run pushed to cloud storage can be retrieved in full — every trade, every signal (executed and rejected), every journal event — within 1 second of completion, with values matching the source data within float-precision tolerance.
- **SC-002**: 100% of cross-user access attempts (read or write, against any user-scoped table) are denied. Verified by automated tests covering every table and both anon and authenticated-but-wrong-user contexts.
- **SC-003**: A new operator can go from "fresh cloud account" to "successfully pushed a backtest run" in under 30 minutes, following only the documented setup steps.
- **SC-004**: The existing local-only backtest CLI workflow continues to work without any changes to its commands, output files, or behavior — confirmed by re-running the existing test suite green.
- **SC-005**: An operator whose cloud credentials are missing or invalid still completes their backtest locally (no data lost) and sees an error message that names the specific missing credential or failure.
- **SC-006**: An operator can sign up, enroll MFA, and complete sign-in (both factors) in under 3 minutes.
- **SC-007**: A backtest run with up to 10,000 emitted signals (executed + rejected combined) completes its cloud push in under 60 seconds on a typical residential connection.
- **SC-008**: Schema provisioning of a fresh cloud database (every migration, registry seed, auth configuration, storage buckets) completes in under 10 minutes by a single operator following the documented steps.

## Assumptions

- A cloud account on the chosen platform (Supabase) is available to the operator running this feature. Costs in this feature are at-or-near $0 for the operator's expected usage.
- The operator running the CLI in this feature is a trusted developer-operator with access to the service-role credential. End-user-facing OTP login flows arrive in feature 007.
- Existing local backtest outputs in `backend/data/backtests/` are NOT migrated automatically. They remain readable by the existing CLI + viewer. A one-off backfill script may be provided as a convenience but isn't required for SC-001 through SC-008.
- The CLI is run by one operator at a time; concurrent multi-operator CLI usage isn't a target for this feature.
- The frontend continues to read from the existing local file-backed API in this feature. Frontend changes are deferred to feature 007.
- The deployment of the FastAPI service is out of scope for this feature; it is deferred to features 006 and 008.
- The constitutional document (`.specify/memory/constitution.md`) will receive a PATCH amendment during this feature's plan phase to acknowledge cloud-backed storage as a permitted option alongside local files. No NON-NEGOTIABLE principle changes.

## Out of Scope

The following items belong to later features and MUST NOT be addressed here:

- A web UI for browsing cloud-stored runs (feature 007).
- A web auth flow visible to end users (feature 007).
- A web API trigger for running backtests (feature 006).
- Production deployment of the FastAPI service or the frontend (feature 008).
- Live trading; principle V still gates this with `live_auto_enabled: false` as the default.
