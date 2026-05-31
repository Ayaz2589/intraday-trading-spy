---

description: "Tasks for Feature 007 — Web UI with Sign-In + Cloud-Backed Run Inspection"
---

# Tasks: Web UI with Sign-In + Cloud-Backed Run Inspection

**Input**: Design documents from `/specs/007-frontend-auth-api-migration/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Clarifications applied** (from `/speckit-clarify` 2026-05-31): Q1 adaptive polling (1s in-flight, 30s terminal); Q2 background-poll tracker (cap 3); Q3 cross-tab sign-out via auth-state-change; Q4 auto-seed default config; Q5 refresh-retry (3 attempts, 1s/2s/4s).

**Tests**: Per constitution principle IV (Test-First Everywhere, NON-NEGOTIABLE, v1.1.0), tests are MANDATORY for any task that touches `frontend/src/**/*.{ts,tsx}` or `backend/src/**/*.py`. Every implementation task has a preceding failing-test task with the same scope.

SQL migrations under `backend/db/migrations/*.sql` are config-adjacent per the constitution's exempt list — paired with integration tests because they encode behavior (the new auto-seed trigger).

**Organization**: Tasks grouped by user story (US1 = sign-in + MFA + runs page MVP; US2 = trigger + follow backtest; US3 = strategy selector; US4 = historical-data downloads).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps task to user story for traceability
- Every task names exact file paths

## Path Conventions

Web app monorepo: backend at `backend/`, frontend at `frontend/`. This feature touches `frontend/` (heavy) + `backend/db/migrations/` (one migration for the auto-seed trigger).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies, env config, router scaffolding. Nothing user-visible yet.

- [X] T001 Install new npm dependencies in `frontend/`: `@supabase/supabase-js@^2.45`, `@tanstack/react-router@^1`, `@tanstack/react-query@^5`, `qrcode.react@^4`. Update `package.json` + `package-lock.json`.
- [X] T002 [P] Install new dev dependencies in `frontend/`: `@tanstack/router-devtools`, `@tanstack/react-query-devtools`, `msw@^2`. Update `package.json`.
- [X] T003 [P] Uninstall `react-router` from `frontend/`. Confirm no remaining `import 'react-router'` lines.
- [X] T004 [P] Create `frontend/.env.example` documenting `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable key only — NEVER service-role), `VITE_API_BASE_URL` (defaults to `http://localhost:8001` in dev).
- [X] T005 [P] Create `frontend/src/config.ts` exporting typed constants: `POLLING_INFLIGHT_MS = 1000`, `POLLING_TERMINAL_MS = 30000`, `POLLING_LIST_MS = 5000`, `POLLING_HEALTH_MS = 10000`, `ACTIVE_RUNS_TRACKER_CAP = 3`, `REFRESH_RETRY_BACKOFFS_MS = [1000, 2000, 4000]`.
- [X] T006 [P] Create `frontend/src/env.ts` with typed accessors for `import.meta.env.VITE_*` variables. Throw at module load if any required var is missing in production.
- [X] T007 [P] Update `frontend/vite.config.ts` to enable env-var validation at build time (warn if `VITE_SUPABASE_URL` is unset). Add `@tanstack/router-vite-plugin` for file-based routes.
- [X] T008 [P] Update root `Makefile` adding `frontend-dev` (already `ui-dev` exists; verify) and a new `dev` target that runs `make api-dev` + `make ui-dev` in parallel (via `&` or process supervisor).
- [X] T009 [P] Update `frontend/README.md` (or create) with a "Sign-in / MFA setup" subsection cross-linking to [specs/007-frontend-auth-api-migration/quickstart.md](./quickstart.md).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend migration + auth module + router skeleton + msw test infra. ALL user stories depend on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### 2a. Backend: auto-seed default config (FR-021 / Q4)

- [X] T010 [P] Write failing INTEGRATION test for the auto-seed trigger: inserting a new `auth.users` row creates exactly one `configs` row for that user with `name='default'`, `live_auto_enabled=false`, the strategy_id of `vwap_pullback_long`. Test idempotency (inserting twice doesn't duplicate). In `backend/tests/storage/test_default_config_trigger.py`.
- [X] T011 Create migration `backend/db/migrations/0070_seed_default_config_on_signup.sql` per [data-model.md §2](./data-model.md): `seed_default_config_for_user(uid uuid)` function + `on_auth_user_created_seed_config` AFTER INSERT trigger. Uses `SECURITY DEFINER` and `ON CONFLICT DO NOTHING`. **Grant verification** (covers analyze finding L5): the function's owner MUST have INSERT privileges on `public.configs`. After applying the migration, confirm via `\df+ seed_default_config_for_user` in psql (owner column) and `\dp public.configs` (privileges). If the trigger fires but the INSERT fails silently in production, this grant is the most likely cause. **Trigger-behavior coverage** (analyze finding L3): runtime behavior is verified by T010, which is opt-in via `SUPABASE_INTEGRATION=1` / `make test-integration`. The migration itself is exempt from TDD per the constitution's principle-IV exempt list (config-adjacent).

### 2b. Frontend: Supabase client + auth module foundation

- [X] T012 Write failing tests for `frontend/src/auth/supabase-client.ts` (singleton client construction from env vars; throws clearly if VITE_SUPABASE_URL is missing) in `frontend/src/auth/supabase-client.test.ts`.
- [X] T013 Implement `frontend/src/auth/supabase-client.ts` exporting a singleton `supabase` client built from `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` with `persistSession: true`.
- [X] T014 Write failing tests for `frontend/src/auth/refresh-retry.ts` (clarification Q5): retry up to 3 times with backoffs [1000, 2000, 4000]; success on 2nd attempt returns the result; exhausted retries throw `SessionExpiredError`. In `frontend/src/auth/refresh-retry.test.ts`.
- [X] T015 Implement `frontend/src/auth/refresh-retry.ts` exporting `withRefreshRetry<T>(op)` + `SessionExpiredError` per [research.md §4](./research.md).
- [X] T016 Write failing tests for `frontend/src/auth/cross-tab.ts` (clarification Q3): subscribes to `onAuthStateChange`; on `SIGNED_OUT` event fires the navigation callback; subscription is cleaned up on unmount. In `frontend/src/auth/cross-tab.test.ts`.
- [X] T017 Implement `frontend/src/auth/cross-tab.ts` exporting `subscribeToCrossTabSignOut(onSignedOut)` helper.
- [X] T018 Write failing tests for `frontend/src/auth/AuthProvider.tsx` (covers signature: provider + useAuth hook; initial session load; state changes on signIn/signOut/refresh; cross-tab subscription). Use mocked supabase-js. In `frontend/src/auth/AuthProvider.test.tsx`.
- [X] T019 Implement `frontend/src/auth/AuthProvider.tsx` per [contracts/auth-flow.md](./contracts/auth-flow.md) — wraps app, exposes `useAuth()` with `session`, `user`, `signInWithOtp`, `verifyOtp`, `enrollMfa`, `confirmMfaEnrollment`, `challengeMfa`, `useBackupCode`, `signOut`.

### 2c. Frontend: typed API client (replaces static-server client)

- [X] T020 Write failing tests for `frontend/src/api/client.ts` (attaches Authorization header from session, handles 401 with refresh-retry, maps documented errors to typed classes, validates response shapes). Use msw to mock HTTP. In `frontend/src/api/client.test.ts`.
- [X] T021 Implement `frontend/src/api/client.ts` per [contracts/data-fetching.md](./contracts/data-fetching.md) — `apiRequest<T>(path, options)` + error classes (`SessionExpiredError`, `NotFoundError`, `ValidationError`, `RateLimitedError`, `ServiceUnavailableError`, `ApiError`).
- [X] T022 [P] Write failing tests for `frontend/src/api/runs.ts` (listRuns / getRun / getRunStatus / listTrades / listSignals / listJournal — each asserts the exact request path + method + searchParams). In `frontend/src/api/runs.test.ts`.
- [X] T023 [P] Write failing tests for `frontend/src/api/backtests.ts` (startBacktest — POST shape + 202 response). In `frontend/src/api/backtests.test.ts`.
- [X] T024 [P] Write failing tests for `frontend/src/api/strategies.ts` (listStrategies). In `frontend/src/api/strategies.test.ts`.
- [X] T025 [P] Write failing tests for `frontend/src/api/data-downloads.ts` (startDataDownload + getDataDownloadJob). In `frontend/src/api/data-downloads.test.ts`.
- [X] T026 [P] Write failing tests for `frontend/src/api/health.ts` (getHealth — no auth, returns `{status, db}`). In `frontend/src/api/health.test.ts`.
- [X] T027 [P] Implement `frontend/src/api/runs.ts` with typed wrappers per [contracts/data-fetching.md](./contracts/data-fetching.md).
- [X] T028 [P] Implement `frontend/src/api/backtests.ts`.
- [X] T029 [P] Implement `frontend/src/api/strategies.ts`.
- [X] T030 [P] Implement `frontend/src/api/data-downloads.ts`.
- [X] T031 [P] Implement `frontend/src/api/health.ts` (does NOT use apiRequest — no auth header).
- [X] T032a Inventory the pre-feature static-server API client files at `frontend/src/api/` AND the test files at `frontend/src/api/*.test.{ts,tsx}` AND the test files in `frontend/src/components/**/*.test.tsx` that import from those files. For each, decide keep / port / retire AND record the decision in `specs/007-frontend-auth-api-migration/test-inventory.md`. Covers analyze finding O1: inventory happens BEFORE deletion so SC-007 ("zero tests left in an unknown state") is satisfied at commit time.
- [X] T032b Delete the legacy API client files + their retired tests AS A SINGLE COMMIT, citing `test-inventory.md` in the commit message (FR-017 / SC-007). The diff must include both the source-file removals AND the test-file removals so reviewers can verify completeness. Depends on T032a being committed first.

### 2d. Frontend: TanStack Router skeleton + Query provider

- [X] T033 Write failing test for `frontend/src/routes/__root.tsx` (renders topbar + outlet; mounts QueryProvider + AuthProvider; renders connection status). In `frontend/src/routes/__root.test.tsx`.
- [X] T034 Implement `frontend/src/routes/__root.tsx` — root layout. Wraps everything in `<QueryClientProvider>` + `<AuthProvider>` + `<RouterProvider>`.
- [X] T035 Write failing test for `frontend/src/routes/_authenticated.tsx` route guard (beforeLoad redirects to `/sign-in?next=<current>` when no session; allows through when session present + aal2; redirects to `/sign-in/mfa` when aal1+factor-enrolled; redirects to `/mfa-enroll` when aal1+no-factor). In `frontend/src/routes/_authenticated.test.tsx`.
- [X] T036 Implement `frontend/src/routes/_authenticated.tsx` per [contracts/routes.md](./contracts/routes.md) — beforeLoad guard, renders Outlet, sidebar layout.
- [X] T037 [P] Write failing tests for `frontend/src/main.tsx` (constructs router from file-based routes; mounts root component into `#root`). In `frontend/src/main.test.tsx`.
- [X] T038 Modify `frontend/src/main.tsx` to use TanStack Router's `createRouter()` + `RouterProvider` instead of react-router. Remove `App.tsx` if it exists.

### 2e. Frontend: opaque cursor pagination helpers

- [X] T039 [P] Write failing tests for `frontend/src/lib/cursor.ts` (encode/decode same shape as Feature 006's contract; round-trip stability; malformed-cursor rejection). In `frontend/src/lib/cursor.test.ts`.
- [X] T040 [P] Implement `frontend/src/lib/cursor.ts` (mirrors `backend/src/intraday_trade_spy/api/pagination.py` — base64-encoded JSON tuple).

### 2f. Frontend: msw test infrastructure

- [X] T041 Create `frontend/src/__tests__/msw-server.ts` with default request handlers (200 responses for the common endpoints) and a `setupServer()` for Vitest's setup file.
- [X] T042 Create `frontend/src/__tests__/setup.ts` (registered in `vite.config.ts`'s `test.setupFiles`) that starts/stops the msw server before/after each test file.

**Checkpoint**: Foundation ready — backend trigger applied, auth module functional, API client typed, router + provider stack mounted, msw available for tests. User story implementation can begin.

---

## Phase 3: User Story 1 — Sign in and land on my runs (Priority: P1) 🎯 MVP

**Goal**: A first-time user opens the app, signs in via email OTP, enrolls MFA, and lands on an (empty) runs page. Sign-out works. Cross-tab sign-out works.

**Independent Test**: Open a fresh browser profile at `/`. Confirm redirect to `/sign-in`. Submit email; receive code; submit code; enroll MFA (QR + backup codes); land on `/runs`. Sign out; confirm next visit returns to `/sign-in`. Open the app in two tabs, sign in both, sign out in tab A → tab B redirects to `/sign-in` within milliseconds.

### Tests for User Story 1 ⚠️

> Write tests FIRST and confirm they FAIL before implementation.

- [X] T043 [P] [US1] Write failing tests for `frontend/src/routes/sign-in/index.tsx` covering: email field validation; submit advances to OTP entry; OTP submit calls verifyOtp; happy path navigates to `?next` or `/runs`; routes to `/mfa-enroll` for first-time users; routes to `/sign-in/mfa` for users with factor enrolled. In `frontend/src/routes/sign-in/index.test.tsx`.
- [X] T044 [P] [US1] Write failing tests for `frontend/src/routes/sign-in/callback.tsx` covering: extracts access_token from URL fragment; calls setSession; redirects to `?next` on success; redirects to `/sign-in` with error toast on failure. In `frontend/src/routes/sign-in/callback.test.tsx`.
- [X] T045 [P] [US1] Write failing tests for `frontend/src/routes/sign-in/mfa.tsx` covering: TOTP code entry; success advances to `?next`; failure displays inline error; "use backup code" link toggles input mode; backup-code path. In `frontend/src/routes/sign-in/mfa.test.tsx`.
- [X] T046 [P] [US1] Write failing tests for `frontend/src/routes/_authenticated.mfa-enroll.tsx` covering: enrollMfa is called on mount; QR code renders from data URL; backup-codes list displays; acknowledgement checkbox with the exact label "I've saved my backup codes" is required (clarified per analyze finding I1 + FR-004) and the Confirm button is disabled until it's checked; confirmMfaEnrollment is called with the typed code; navigation to `?next` on success. In `frontend/src/routes/_authenticated.mfa-enroll.test.tsx`.
- [X] T047 [P] [US1] Write failing tests for `frontend/src/routes/_authenticated.runs.tsx` covering: empty state when no runs; "Start Backtest" button visible; loading state; error state; renders runs list when data present. In `frontend/src/routes/_authenticated.runs.test.tsx`. (For US1 the focus is the empty runs page — list rendering with rows belongs to US2's tests.)
- [X] T048 [P] [US1] Write failing tests for `frontend/src/components/topbar.tsx` (modified) covering: user email + sign-out menu visible when authenticated; sign-out triggers signOut + redirect to /sign-in; connection-status dot reflects health state. In `frontend/src/components/topbar.test.tsx`.
- [X] T049 [P] [US1] Write failing tests for `frontend/src/components/connection-status.tsx` covering: green when healthy; red when DB unreachable; transition within 5s of first failed request (SC-005). In `frontend/src/components/connection-status.test.tsx`.
- [X] T050 [P] [US1] Write failing tests for `frontend/src/components/auth/SignInForm.tsx` (email validation, submit handler) in `frontend/src/components/auth/SignInForm.test.tsx`.
- [X] T051 [P] [US1] Write failing tests for `frontend/src/components/auth/OtpCodeForm.tsx` (6-digit code input, submit handler, paste handling) in `frontend/src/components/auth/OtpCodeForm.test.tsx`.
- [X] T052 [P] [US1] Write failing tests for `frontend/src/components/auth/MfaEnrollment.tsx` (renders QR + secret + backup codes; acknowledgement gate) in `frontend/src/components/auth/MfaEnrollment.test.tsx`.
- [X] T053 [P] [US1] Write failing tests for `frontend/src/components/auth/MfaChallenge.tsx` (TOTP entry; backup-code toggle) in `frontend/src/components/auth/MfaChallenge.test.tsx`.
- [X] T054 [P] [US1] Write failing tests for `frontend/src/components/auth/SignOutMenu.tsx` (dropdown with user email + sign-out action) in `frontend/src/components/auth/SignOutMenu.test.tsx`.
- [X] T055 [P] [US1] Write failing tests for `frontend/src/hooks/useHealth.ts` (polls /healthz every 10s; surfaces green/red state). In `frontend/src/hooks/useHealth.test.ts`.
- [X] T056 [US1] Write failing INTEGRATION test for cross-tab sign-out (Q3 / FR-020): mount AuthProvider in two test renders; sign in one; sign out one; assert the other receives the SIGNED_OUT event and navigates within 100ms. In `frontend/src/__tests__/cross-tab-signout.test.tsx`.

### Implementation for User Story 1

- [X] T057 [US1] Implement `frontend/src/components/auth/SignInForm.tsx` — email entry form.
- [X] T058 [US1] Implement `frontend/src/components/auth/OtpCodeForm.tsx` — 6-digit code entry with paste support.
- [X] T059 [US1] Implement `frontend/src/components/auth/MfaEnrollment.tsx` — QR (via qrcode.react), plaintext secret, backup-codes list with acknowledgement checkbox.
- [X] T060 [US1] Implement `frontend/src/components/auth/MfaChallenge.tsx` — TOTP entry + backup-code mode toggle.
- [X] T061 [US1] Implement `frontend/src/components/auth/SignOutMenu.tsx` — Radix Dropdown w/ user email + sign-out action.
- [X] T062 [US1] Implement `frontend/src/components/connection-status.tsx` — colored dot polling /healthz via useHealth, with a HelpTooltip.
- [X] T063 [US1] Modify `frontend/src/components/topbar.tsx` — add SignOutMenu + ConnectionStatus + (placeholder) strategy/config breadcrumb. Retain existing layout from Feature 004.
- [X] T064 [US1] Implement `frontend/src/hooks/useHealth.ts` — useQuery with 10s polling, no auth required.
- [X] T065 [US1] Implement `frontend/src/routes/sign-in/index.tsx` — orchestrates SignInForm → OtpCodeForm → routes to mfa-enroll OR /sign-in/mfa OR `?next`.
- [X] T066 [US1] Implement `frontend/src/routes/sign-in/callback.tsx` — magic-link redirect handler. (Useful when user clicks the link rather than typing the code.)
- [X] T067 [US1] Implement `frontend/src/routes/sign-in/mfa.tsx` — MfaChallenge wrapper with route logic.
- [X] T068 [US1] Implement `frontend/src/routes/_authenticated.mfa-enroll.tsx` — MfaEnrollment wrapper with route logic.
- [X] T069 [US1] Implement `frontend/src/routes/_authenticated.runs.tsx` (empty-state stub; US2 fleshes out the list/dialog).
- [X] T070 [US1] Implement `frontend/src/routes/index.tsx` — redirects authenticated users to `/runs`.
- [X] T071 [US1] Create `frontend/manual-tests/MFA_FLOW.md` — end-to-end runbook (parallel to Feature 005's MFA runbook): fresh user signup → OTP → MFA enroll → backup codes → sign out → sign in → MFA challenge → wrong code → right code.

**Checkpoint**: User Story 1 is fully functional. SC-001 (sign-in to runs page in <3 min) demonstrable. SC-005 (connection status indicator within 5s) demonstrable. FR-020 (cross-tab sign-out) demonstrable.

---

## Phase 4: User Story 2 — Start a backtest and follow it to completion (Priority: P2)

**Goal**: Authenticated user clicks "Start Backtest", picks a config, watches the run progress through queued → running → finished, drills into the detail view.

**Independent Test**: Sign in. Click "Start Backtest", pick `default` config, click Start. Run appears with status `queued` immediately; transitions to `running` within 1 second, then `finished` within 5 seconds on the fixture. Click into the run; verify summary metrics, trades table, signals (executed + rejected tabs), and journal events all render with data matching the backend.

### Tests for User Story 2 ⚠️

- [X] T072 [P] [US2] Write failing tests for `frontend/src/hooks/useRuns.ts` (TanStack Query hook with 5s polling; cursor pagination; invalidation on mutation). In `frontend/src/hooks/useRuns.test.ts`.
- [X] T073 [P] [US2] Write failing tests for `frontend/src/hooks/useRun.ts` (per-run query with adaptive polling per Q1; user-isolation 404 → NotFoundError). In `frontend/src/hooks/useRun.test.ts`.
- [X] T074 [P] [US2] Write failing tests for `frontend/src/hooks/useRunStatus.ts` (adaptive polling 1s/30s based on status from query data per Q1; covers all 4 lifecycle states). In `frontend/src/hooks/useRunStatus.test.ts`.
- [X] T075 [P] [US2] Write failing tests for `frontend/src/hooks/useRunTrades.ts` + `useRunSignals.ts` + `useRunJournal.ts` (cursor pagination, executed-filter for signals). In `frontend/src/hooks/useRunTrades.test.ts`, `useRunSignals.test.ts`, `useRunJournal.test.ts`.
- [X] T076 [P] [US2] Write failing tests for `frontend/src/hooks/useStartBacktest.ts` (POST mutation; on success registers in tracker and invalidates runs query). In `frontend/src/hooks/useStartBacktest.test.ts`.
- [X] T077 [P] [US2] Write failing tests for `frontend/src/lib/active-runs-tracker.ts` (Q2 — capacity-3 LRU; track/untrack; useSyncExternalStore subscriber; terminal-state cleanup). In `frontend/src/lib/active-runs-tracker.test.ts`.
- [X] T078 [P] [US2] Write failing tests for `frontend/src/lib/polling.ts` (`adaptivePollingInterval` function: queued/running → 1000; finished/failed → 30000; undefined → false). In `frontend/src/lib/polling.test.ts`.
- [ ] T079 [P] [US2] Write failing tests for `frontend/src/components/runs/RunsList.tsx` (renders rows; empty state directs to Start Backtest button; cursor pagination loads more). In `frontend/src/components/runs/RunsList.test.tsx`.
- [ ] T080 [P] [US2] Write failing tests for `frontend/src/components/runs/RunRow.tsx` (status badge color/label per state; link to detail; failed runs show failure_reason inline). In `frontend/src/components/runs/RunRow.test.tsx`.
- [ ] T081 [P] [US2] Write failing tests for `frontend/src/components/runs/RunDetail.tsx` (tabs: summary/trades/signals/journal; deep-link to a wrong-user run renders NotFoundView). In `frontend/src/components/runs/RunDetail.test.tsx`.
- [ ] T082 [P] [US2] Write failing tests for `frontend/src/components/runs/TradesTable.tsx` (renders trades; columns match Feature 006's TradeView shape; constitution III: stop+target visible). In `frontend/src/components/runs/TradesTable.test.tsx`.
- [ ] T083 [P] [US2] Write failing tests for `frontend/src/components/runs/SignalsTable.tsx` (executed/rejected tabs; rejection_reason visible for rejected; constitution VII verification). In `frontend/src/components/runs/SignalsTable.test.tsx`.
- [ ] T084 [P] [US2] Write failing tests for `frontend/src/components/runs/JournalTable.tsx` (event kind + severity + message + details). In `frontend/src/components/runs/JournalTable.test.tsx`.
- [ ] T085 [P] [US2] Write failing tests for `frontend/src/components/runs/StartBacktestDialog.tsx` (strategy + config selectors; data source selector; submit calls useStartBacktest). Constitution I/II/V coverage (tightened per analyze finding U1): explicitly assert `queryByLabelText(/symbol/i)` returns `null`, `queryByLabelText(/direction/i)` returns `null`, and the rendered tree contains no `name="live_auto_enabled"` form input AND no element with `data-testid="live-auto-enabled"`. The absence-tests must use `queryBy*` (returns null) not `getBy*` (throws) so the assertions are explicit. In `frontend/src/components/runs/StartBacktestDialog.test.tsx`.
- [ ] T086 [P] [US2] Write failing tests for `frontend/src/components/runs/RunSummaryCards.tsx` (renders pnl, win_rate, sharpe, etc.). In `frontend/src/components/runs/RunSummaryCards.test.tsx`.
- [ ] T087 [US2] Write failing INTEGRATION test for the full lifecycle: render `_authenticated.runs.tsx` with msw mocks; click Start Backtest; assert new row appears in `queued`; advance mock time / responses to `running` then `finished`; assert UI reflects each transition within the polling cadence. In `frontend/src/__tests__/run-lifecycle.test.tsx`.
- [ ] T088 [US2] Write failing INTEGRATION test for background polling (Q2): start a run on `/runs`, navigate to `/strategies`; assert the runs-tracker continues to poll; navigate back; assert status reflects the latest state. In `frontend/src/__tests__/background-polling.test.tsx`.

### Implementation for User Story 2

- [X] T089 [P] [US2] Implement `frontend/src/lib/polling.ts` — `adaptivePollingInterval(query)` per [research.md §8](./research.md).
- [X] T090 [P] [US2] Implement `frontend/src/lib/active-runs-tracker.ts` — `useSyncExternalStore`-backed store with 3-cap LRU.
- [X] T091 [P] [US2] Implement `frontend/src/hooks/useRuns.ts` per [contracts/data-fetching.md](./contracts/data-fetching.md).
- [X] T092 [P] [US2] Implement `frontend/src/hooks/useRun.ts`.
- [X] T093 [P] [US2] Implement `frontend/src/hooks/useRunStatus.ts` (uses adaptive polling).
- [X] T094 [P] [US2] Implement `frontend/src/hooks/useRunTrades.ts`, `useRunSignals.ts`, `useRunJournal.ts`.
- [X] T095 [P] [US2] Implement `frontend/src/hooks/useStartBacktest.ts` (POST mutation + tracker registration + query invalidation).
- [X] T096 [P] [US2] Implement `frontend/src/components/runs/RunRow.tsx` — row with status badge from `RunStatusLiteral` enum.
- [X] T097 [US2] Implement `frontend/src/components/runs/RunsList.tsx` (uses useRuns + useInfiniteQuery; empty state with link to Start Backtest).
- [X] T098 [US2] Implement `frontend/src/components/runs/StartBacktestDialog.tsx` (strategy + config + data pickers).
- [X] T099 [P] [US2] Implement `frontend/src/components/runs/RunSummaryCards.tsx`.
- [X] T100 [P] [US2] Implement `frontend/src/components/runs/TradesTable.tsx`.
- [X] T101 [P] [US2] Implement `frontend/src/components/runs/SignalsTable.tsx` (tabs for executed/rejected; HelpTooltip on "rejected signal" concept per contracts/help-tooltips.md).
- [X] T102 [P] [US2] Implement `frontend/src/components/runs/JournalTable.tsx`.
- [X] T103 [US2] Implement `frontend/src/components/runs/RunDetail.tsx` (assembles summary cards + tabs).
- [X] T104 [US2] Modify `frontend/src/routes/_authenticated.runs.tsx` (from US1 stub) — wire RunsList + StartBacktestDialog. Add background-polling subscriber at this route (or higher in `_authenticated.tsx`) so all of US2's polling lifecycle works.
- [X] T105 [US2] Implement `frontend/src/routes/_authenticated.runs.$runId.tsx` — wraps RunDetail with route params + tab search-param state.
- [X] T105a [P] [US2] Write failing test for `routes/_authenticated.runs.$runId.tsx` route-level concerns (covers analyze finding L1): TanStack Router `runId` param extracts to a UUID; the `tab` search param round-trips via `useNavigate({ search })`; navigating to an invalid (non-UUID) `runId` renders NotFoundView; the `tab` defaults to `summary` when absent. In `frontend/src/routes/_authenticated.runs.$runId.test.tsx`. (TDD-paired with T105 — write this BEFORE T105.)
- [ ] T106 [US2] Add the `useBackgroundPolling()` hook in `frontend/src/lib/active-runs-tracker.ts` (same module as the tracker — keeps Q2 logic in one place; covers analyze finding L2) and mount it inside `frontend/src/routes/_authenticated.tsx`'s root component so Q2 background polling applies across every protected route.

**Checkpoint**: SC-002 demonstrable — backtest start → finished → results visible in under 2 minutes. FR-008 (adaptive polling) verified by integration tests. FR-006 (user-scope) inherited from Feature 006's 404 contract.

---

## Phase 5: User Story 3 — Strategy selector (Priority: P3)

**Goal**: Pick from the registry-driven strategy selector before triggering a backtest. New strategies added in the registry appear after a page refresh without UI code change.

### Tests for User Story 3 ⚠️

- [X] T107 [P] [US3] Write failing tests for `frontend/src/hooks/useStrategies.ts` (60s cache + polling; returns only enabled strategies; useQuery semantics). In `frontend/src/hooks/useStrategies.test.ts`.
- [X] T108 [P] [US3] Write failing tests for `frontend/src/components/strategies/StrategyList.tsx` (renders cards for each enabled strategy; HelpTooltip on "Strategy registry"). In `frontend/src/components/strategies/StrategyList.test.tsx`.
- [X] T109 [P] [US3] Write failing tests for `frontend/src/components/strategies/StrategyCard.tsx` (renders display_name, description, symbol, direction; no symbol/direction selectors per FR-016). In `frontend/src/components/strategies/StrategyCard.test.tsx`.
- [X] T110 [US3] Write failing INTEGRATION test for SC-004 verification: render StartBacktestDialog with mock strategies API returning 1 strategy; assert it's the default selection; mock returns 2 strategies on next call; refresh; assert both appear without code change. In `frontend/src/__tests__/strategy-registry-refresh.test.tsx`.

### Implementation for User Story 3

- [X] T111 [P] [US3] Implement `frontend/src/hooks/useStrategies.ts`.
- [X] T112 [P] [US3] Implement `frontend/src/components/strategies/StrategyCard.tsx`.
- [X] T113 [US3] Implement `frontend/src/components/strategies/StrategyList.tsx`.
- [X] T114 [US3] Implement `frontend/src/routes/_authenticated.strategies.tsx`.
- [X] T115 [US3] Update `frontend/src/components/runs/StartBacktestDialog.tsx` (from US2) to source its strategy options from `useStrategies()` (no hardcoded list).

**Checkpoint**: SC-004 (new strategies appear without UI change) demonstrable. Strategy registry is fully data-driven.

---

## Phase 6: User Story 4 — Historical-data download (Priority: P4)

**Goal**: Submit a date range; watch the job progress; use the downloaded data in a subsequent backtest.

### Tests for User Story 4 ⚠️

- [X] T116 [P] [US4] Write failing tests for `frontend/src/hooks/useStartDataDownload.ts` (POST mutation; invalidates downloads query on success). In `frontend/src/hooks/useStartDataDownload.test.ts`.
- [X] T117 [P] [US4] Write failing tests for `frontend/src/hooks/useDataDownloadJob.ts` (adaptive polling per Q1; same lifecycle as runs). In `frontend/src/hooks/useDataDownloadJob.test.ts`.
- [X] T118 [P] [US4] Write failing tests for `frontend/src/components/data/DataDownloadForm.tsx` (date pickers; range validation; submit handler). In `frontend/src/components/data/DataDownloadForm.test.tsx`.
- [X] T119 [P] [US4] Write failing tests for `frontend/src/components/data/DataDownloadsList.tsx` (renders jobs with statuses). In `frontend/src/components/data/DataDownloadsList.test.tsx`.
- [X] T120 [P] [US4] Write failing tests for `frontend/src/components/data/DataDownloadStatus.tsx` (status badge; failure_reason for failed jobs). In `frontend/src/components/data/DataDownloadStatus.test.tsx`.

### Implementation for User Story 4

- [X] T121 [P] [US4] Implement `frontend/src/hooks/useStartDataDownload.ts`.
- [X] T122 [P] [US4] Implement `frontend/src/hooks/useDataDownloadJob.ts`.
- [X] T123 [P] [US4] Implement `frontend/src/components/data/DataDownloadStatus.tsx`.
- [X] T124 [P] [US4] Implement `frontend/src/components/data/DataDownloadForm.tsx`.
- [X] T125 [US4] Implement `frontend/src/components/data/DataDownloadsList.tsx`.
- [X] T126 [US4] Implement `frontend/src/routes/_authenticated.data.tsx` — list + form layout.
- [ ] T127 [US4] Update `frontend/src/components/runs/StartBacktestDialog.tsx` to include finished data-download jobs in the "Data source" picker (FR-012).
- [ ] T127a [P] [US4] Write failing test for StartBacktestDialog's data-source picker (covers analyze finding C1): with mocked `useDataDownloads` returning two jobs (one `finished`, one `running`), assert the picker shows the finished one as a selectable option AND does NOT show the running one. With no finished jobs, picker shows only the bundled-fixture default. In `frontend/src/components/runs/StartBacktestDialog.data-picker.test.tsx`.

**Checkpoint**: SC-002-adjacent — user can drive a data download to completion from the UI. FR-012 (downloaded data selectable for next backtest) demonstrable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: HelpTooltip coverage audit, retired-tests inventory, analyze gate, quickstart sign-off.

- [X] T128 [P] Define the canonical concept-key enum in `frontend/src/components/HelpTooltip.tsx` (or sibling `concepts.ts`) with these 11 keys per [contracts/help-tooltips.md](./contracts/help-tooltips.md): `mfa`, `totp`, `otp`, `backup_codes`, `session`, `saved_config`, `strategy_registry`, `backtest_queue`, `run_status`, `cloud_push`, `data_download_job`, `connection_status`. Then write the structural test in `frontend/src/__tests__/help-tooltips.test.tsx` (tightened per analyze finding U2): the test mounts the protected app for an authenticated user and, for each concept key in the enum, asserts at least one `<HelpTooltip concept={key} />` element renders somewhere in the tree. Adding a new concept to the enum without a corresponding tooltip causes the test to fail. Covers SC-008.
- [X] T129 [P] Inventory existing Feature 003/004 tests in `frontend/src/components/**/*.test.tsx`. For each: keep / port / retire per SC-007. Document the retirement reason in commit messages.
- [X] T130 [P] Add `make ui-test` and `make ui-test-integration` targets to root `Makefile` if not already present. Document `FRONTEND_INTEGRATION=1` env var for opt-in integration tests.
- [ ] T131 Run `/speckit-analyze` to cross-check spec ↔ plan ↔ tasks consistency. Address any findings.
- [ ] T132 Run [quickstart.md](./quickstart.md) end-to-end against the live Supabase project. Fix any documentation drift. Sign-off blocks the feature.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion. BLOCKS all user stories.
- **US1 (Phase 3, P1 MVP)**: Depends on Foundational. Independent of US2/US3/US4.
- **US2 (Phase 4, P2)**: Depends on Foundational AND US1's empty-runs route (T069) being in place. Otherwise independent.
- **US3 (Phase 5, P3)**: Depends on Foundational. Independent of US1/US2 — but US3's T115 modifies US2's StartBacktestDialog, so US3 should land AFTER US2's T098 ships.
- **US4 (Phase 6, P4)**: Depends on Foundational. T127 modifies US2's StartBacktestDialog (similar coupling to US3). Order: Foundational → US1 → US2 → (US3 || US4).
- **Polish (Phase 7)**: Depends on all desired user stories being complete.

### Within Phase 2 (Foundational)

- T010 (migration test) writes BEFORE T011 (migration impl) per TDD.
- T012-T019 (auth module test/impl pairs) sequential within each pair; parallel between pairs.
- T020-T031 (API client + per-resource modules) — T020 + T021 (client) before T022-T031 (modules).
- T032a (inventory) AFTER T031 (everything that referenced the legacy is moved); T032b (delete) AFTER T032a + after the keep/port decisions are committed.
- T033-T038 (router skeleton) — T033/T035 tests before T034/T036 impls; T037-T038 last (main.tsx + the route registration).
- T039-T040 (cursor) parallel with the API client work.
- T041-T042 (msw setup) parallel with everything; needed before any test that uses msw runs.

### Within Phase 3 (US1)

- T043-T056 (all test files) parallel BEFORE T057+ implementation.
- T056 (cross-tab integration test) depends on T019 (AuthProvider impl) being complete.
- T057-T064 (auth components + hooks) parallel; ordering: components before routes that use them.
- T065-T070 (sign-in routes + index) sequential after their underlying components.
- T071 (manual MFA runbook) parallel with anything; documentation.

### Within Phase 4 (US2)

- T072-T088 + T105a (all test files) parallel BEFORE T089+ implementation.
- T087-T088 (integration tests) depend on the rest of US1 + US2 implementation being in place (so they're realistic).
- T089-T103 (hooks + components) — hooks first; tables / cards / dialogs parallel; RunDetail (T103) after its tabs.
- T105a (route-level test) writes BEFORE T105 (route impl) per principle IV.
- T104-T106 (routes + background polling mount) last.

### Within Phase 5 (US3)

- T107-T110 (test files) parallel before T111+ impl.
- T111-T114 (hook + components + route) parallel where files differ.
- T115 (modify StartBacktestDialog) AFTER T098 (US2's dialog impl).

### Within Phase 6 (US4)

- T116-T120 (test files) parallel before T121+ impl.
- T121-T126 (hooks + components + route) parallel where files differ.
- T127 (modify StartBacktestDialog) AFTER T098 + T115.
- T127a (data-picker test) MUST be written BEFORE T127 per principle IV.

### Parallel Opportunities

**Phase 1 setup**: T002-T009 parallel after T001.

**Phase 2 migrations + auth tests**: T010, T012, T014, T016, T018 parallel.

**Phase 2 API client tests**: T020, T022, T023, T024, T025, T026 parallel.

**Phase 2 API client impls**: T027-T031 parallel after their tests.

**Phase 3 US1 test files (T043-T055)**: all parallel (different test files).

**Phase 3 US1 component impls (T057-T062)**: parallel after their tests.

**Phase 4 US2 test files (T072-T086)**: all parallel.

**Phase 4 US2 component impls (T089-T102)**: parallel where files differ.

**Phase 5 US3**: T107-T109 + T111-T113 fully parallel.

**Phase 6 US4**: T116-T120 + T121-T125 fully parallel.

**Phase 7 polish**: T128-T130 parallel; T131-T132 sequential after.

---

## Parallel Example: Phase 3 — User Story 1 tests

```bash
# Launch all US1 test files in parallel BEFORE any US1 implementation:
Task: "T043 sign-in route test → frontend/src/routes/sign-in/index.test.tsx"
Task: "T044 callback route test → frontend/src/routes/sign-in/callback.test.tsx"
Task: "T045 MFA challenge route test → frontend/src/routes/sign-in/mfa.test.tsx"
Task: "T046 MFA enroll route test → frontend/src/routes/_authenticated.mfa-enroll.test.tsx"
Task: "T047 runs route test (empty state) → frontend/src/routes/_authenticated.runs.test.tsx"
Task: "T048 topbar test → frontend/src/components/topbar.test.tsx"
Task: "T049 connection-status test → frontend/src/components/connection-status.test.tsx"
Task: "T050-T054 auth component tests → frontend/src/components/auth/*.test.tsx"
Task: "T055 useHealth hook test → frontend/src/hooks/useHealth.test.ts"
# Run all → confirm RED → proceed to implementation
```

---

## Implementation Strategy

### MVP scope (User Story 1 only)

1. Complete Phase 1: Setup (deps + env + router scaffolding).
2. Complete Phase 2: Foundational (backend trigger + auth module + API client + router skeleton + msw).
3. Complete Phase 3: User Story 1 (sign-in + MFA + empty runs page + cross-tab sign-out).
4. **STOP and VALIDATE**: Run all tests green. Run `npm run dev` + manual sign-in flow against your live Supabase. Confirm an empty `/runs` page renders for the authenticated user.
5. MVP delivers SC-001, SC-005, SC-007 partial. SC-002 awaits US2; SC-004 awaits US3.

### Incremental delivery

1. Setup + Foundational → all infra in place.
2. + US1 → authenticated entry; sign-in + MFA + empty runs page. **MVP**.
3. + US2 → full run lifecycle in UI; SC-002 demonstrable.
4. + US3 → strategy selector data-driven; SC-004 demonstrable.
5. + US4 → data downloads in UI.
6. + Polish → tooltip audit, retired-tests cleanup, analyze gate, quickstart verification.

### Parallel-team strategy

After Phase 2 lands, US1 / US2 / US3 / US4 can be worked by different developers:

- **Dev A**: US1 (P1 MVP) — sign-in + MFA + topbar + connection status + empty routes.
- **Dev B**: US2 (P2) — runs list + detail + start-backtest + tables + tracker. Depends on US1's `_authenticated.runs.tsx` stub (T069) landing first.
- **Dev C**: US3 (P3) — strategies route + hook + cards. Depends on US2's StartBacktestDialog (T098) for T115.
- **Dev D**: US4 (P4) — data download form + jobs list. Depends on US2's StartBacktestDialog for T127.

Most conflicts are minimal — each story owns its own route + components.

---

## Notes

- `[P]` = parallelizable: different files, no shared state, no dependencies on incomplete tasks.
- `[Story]` label maps task to user story for traceability through CI and PR descriptions.
- Every test task name starts with "Write failing test" or "Write failing INTEGRATION test". COMPLETE when the test exists AND has been observed to fail. The implementation task that follows turns it green.
- All `frontend/src/**/*.{ts,tsx}` tasks follow strict TDD per constitution principle IV.
- The single new backend migration (T011) is config-adjacent per the constitution's exempt list but paired with an integration test (T010) for the trigger behavior.
- All HelpTooltips for new concepts come from `contracts/help-tooltips.md`; the structural test in T128 enforces coverage (SC-008).
- Retired Feature 003 tests (T129) should be removed in the same commit that removes their referenced static-server code, with a clear message in the commit body.
- Polling cadence constants (1s/30s/5s/10s) live in `frontend/src/config.ts` (T005); changes there don't require touching individual hooks.
- The background runs tracker cap (3) lives in `frontend/src/config.ts`.
- The 3 refresh-retry backoffs (1s/2s/4s) live in `frontend/src/config.ts`.
- Commit after each test/implementation pair lands green. Avoid lumpy "Phase 2 complete" mega-commits — frontend especially benefits from many small commits per the existing Feature 003/004 commit style.
- Stop at any checkpoint to demo the partial result; each phase delivers a working app.
