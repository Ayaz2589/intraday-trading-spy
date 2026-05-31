# Feature Specification: Web UI with Sign-In + Cloud-Backed Run Inspection

**Feature Branch**: `007-frontend-auth-api-migration`

**Created**: 2026-05-30

**Status**: Draft

**Input**: User description: "Frontend auth + API migration — third of four sequential features in the cloud migration (`docs/migrations/2026-05-30-supabase-vercel-migration.md`). Features 005 and 006 delivered the cloud data layer + authenticated HTTP backend; this feature gives end-users a web UI to sign in, trigger backtests, and inspect results — replacing the existing operator-only static-file frontend."

## Clarifications

### Session 2026-05-31

- Q: What polling cadence should the UI use for run + job status updates? → A: Adaptive — 1 second while a resource is in an in-flight state (`queued`/`running`), 30 seconds while in a terminal state (`finished`/`failed`); only resources visible in the current view are polled. Balances responsiveness for active work against backend load for browsing finished runs.
- Q: When the user navigates away from a page while one of their runs is in flight, should the UI keep polling it in the background? → A: Yes — the UI maintains a small client-side "active runs" tracker capped at 3 concurrent. Runs the current user started in this session are polled at the in-flight cadence (Q1) regardless of which page is in view; they drop out of the tracker on reaching a terminal state. New starts beyond the cap are still allowed by the backend but the UI prioritises tracking the most recently started 3.
- Q: If the user has the app open in two tabs and signs out in one, what happens in the other? → A: Detect immediately via the auth-state-change event. Sign-out in tab A causes tab B to redirect to the sign-in page within milliseconds (no waiting for the next API call to fail). Closes the multi-tab leak window cleanly.
- Q: A brand-new user with zero saved configurations signs in — what should happen when they click "Start Backtest"? → A: Auto-seed a "default" config on first sign-in. The backend creates a starter config row (using the bundled `backend/config/config.yaml` shape) the first time a user successfully authenticates, so every new user can run a backtest with zero out-of-band setup. Adds a Supabase auth trigger OR a backend first-load endpoint; chosen during planning.
- Q: When the access-token refresh fails (revoked refresh token, expired refresh token, network down at refresh time), how should the UI react? → A: Silent retry up to 3 attempts with exponential backoff (1s → 2s → 4s); on exhaustion, route through the FR-019 session-expired flow (redirect to sign-in with current path preserved). Tolerates transient network blips without kicking the user out; a real server-side revocation eventually surfaces via FR-019 within ~7 seconds.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Sign in and land on my runs (Priority: P1)

As a first-time user, I can open the web app, sign in with my email via a one-time code, enroll a second authentication factor if I haven't already, and land on a runs page that shows my account's runs (initially empty). Subsequent visits sign me in without re-entering my password (because I never had one — sign-in is by email code). Signing out clears my session.

**Why this priority**: Without sign-in, the web app is useless to anyone beyond the operator on their own laptop. This is the foundation for every other user-facing feature. P1 = the MVP.

**Independent Test**: From a fresh browser profile, visit the app's root URL. Confirm the user is redirected to a sign-in page. Submit a new email; receive a code via email; submit the code; complete second-factor enrollment if prompted; land on the runs page. Sign out and confirm subsequent root-URL visits return to sign-in.

**Acceptance Scenarios**:

1. **Given** a fresh visitor with no session, **When** they visit any protected page, **Then** they are redirected to the sign-in page with their original destination preserved as a return target.
2. **Given** a visitor on the sign-in page, **When** they submit their email, **Then** they receive a one-time code via email and the UI advances to a "enter the code" prompt.
3. **Given** a visitor with a freshly-arrived code, **When** they submit the correct code, **Then** the system either (a) prompts for second-factor enrollment if they have not yet enrolled, or (b) prompts for the second-factor code if they have, or (c) signs them in directly if their account does not require a second factor.
4. **Given** an unenrolled user signing in for the first time, **When** they complete second-factor enrollment (scan a QR with an authenticator app, confirm a generated code, save backup codes), **Then** they are signed in and routed to their originally requested page (or the runs page by default).
5. **Given** a signed-in user, **When** they choose "Sign out", **Then** their session is cleared and subsequent visits return to the sign-in page.
6. **Given** an unauthenticated visitor, **When** they request a deep link (e.g., `/runs/<id>`), **Then** after signing in they are taken to that deep link, not back to the runs index.

---

### User Story 2 — Start a backtest and follow it to completion (Priority: P2)

As an authenticated user, I can click a "Start Backtest" button, pick a configuration, and watch the run progress from `queued` to `running` to `finished` (or `failed`) without leaving the page. When it's finished I can drill into the run to see trades, signals (including rejected ones), the journal, and summary metrics — every number scoped to my account.

**Why this priority**: This is the everyday user task — the whole point of the app. P2 because it depends on P1 (a signed-in user) but is the most visible value of the rest of the system.

**Independent Test**: Sign in, click "Start Backtest", pick the default config. Confirm the new run appears in the runs list with status `queued`, transitions to `running`, then to `finished` within the time budget for a typical run. Click into the finished run; confirm trades / signals / journal / summary are all visible and match what the backend recorded.

**Acceptance Scenarios**:

1. **Given** an authenticated user on the runs page, **When** they click "Start Backtest" and select a saved configuration, **Then** the system creates a new run and the UI immediately shows it in the runs list with status `queued`.
2. **Given** a queued run, **When** the system advances it to `running` then `finished`, **Then** the UI reflects each transition within a couple of seconds — without a manual refresh.
3. **Given** a finished run, **When** the user clicks the row, **Then** they see a detail view with summary metrics, an ordered list of trades, the full signal stream (executed + rejected as distinct rows), and the journal events.
4. **Given** a backtest that crashes mid-run, **When** the system marks it `failed`, **Then** the UI shows the failure reason and the user can start a new run without operator intervention.
5. **Given** an authenticated user, **When** they attempt to view a run they don't own (e.g., via deep link to someone else's run id), **Then** the UI returns "not found" — the system does not confirm or deny existence.

---

### User Story 3 — Pick a strategy before running (Priority: P3)

As an authenticated user, I can pick a strategy from a selector before triggering a backtest. The selector lists strategies discovered from the registry, so future-added strategies appear without any UI change.

**Why this priority**: Lays groundwork for the multi-strategy future the system is being designed for. Today the registry has only one strategy; the UI must not hardcode that.

**Independent Test**: Open the backtest-start UI and observe the strategy selector shows the registry's enabled strategies (currently one: `VWAP Pullback (Long)`). When a new strategy is added to the registry, refresh the page and confirm it appears in the dropdown without any UI code change.

**Acceptance Scenarios**:

1. **Given** the registry has one enabled strategy, **When** the user opens the backtest-start UI, **Then** the strategy selector contains that strategy as the default selection.
2. **Given** the registry gains a second enabled strategy (via a backend change), **When** the user refreshes the page, **Then** the selector includes both strategies and the user can pick either.
3. **Given** a strategy is `enabled = false` in the registry, **When** the user opens the selector, **Then** that strategy is not listed.

---

### User Story 4 — Download historical data + watch its progress (Priority: P4)

As an authenticated user, I can request a historical-data download for a date range from the UI. The request returns immediately; the download runs asynchronously; the UI shows the job's status and notifies me when the data is ready for use in a backtest.

**Why this priority**: Quality-of-life endpoint. Without it, users would need shell access to fetch yfinance data. Lowest priority because users can also use existing data.

**Independent Test**: Open the data-download panel, pick a date range, submit. The UI shows a new job with status `queued`. The job transitions through `running` to `finished` (or `failed` on a transient retry-exhausted failure) and the resulting data becomes selectable in the backtest-start UI's "data" picker.

**Acceptance Scenarios**:

1. **Given** an authenticated user on the data panel, **When** they submit a valid date range, **Then** a new job appears in the jobs list with status `queued`.
2. **Given** a queued data-download job, **When** the system advances it to `running` then `finished`, **Then** the UI shows each transition without manual refresh.
3. **Given** a finished data-download job, **When** the user starts a new backtest, **Then** the downloaded data range is selectable as the input data for that backtest.
4. **Given** a download job that fails (after the retry budget exhausts), **When** the user opens it, **Then** they see the failure reason and can re-submit.

---

### Edge Cases

- **Session expires while user is interacting**: The system detects the expired session on the next request, redirects the user to the sign-in page with the current path preserved as the return target, and after re-auth restores them to where they were.
- **User has MFA enabled on one device, signs in on a new one**: Sign-in prompts for both the email code AND the second-factor code. Without the second factor, the sign-in is refused.
- **User lost their second-factor device but has backup codes**: They can submit a backup code in place of the second-factor code; on success, the system rotates MFA enrollment and the user is signed in.
- **Slow backend (start-backtest returns within 1s but progress is slow)**: The UI shows the queued/running state and a spinner; it does not block other navigation. The user can navigate away and return to find the same run still progressing.
- **Network blip during a poll**: The UI shows a connection-trouble indicator (the topbar health dot turns yellow/red); polling retries with backoff; when connectivity returns, the UI catches up without losing in-flight context.
- **The pre-feature local-only API endpoints (Feature 003's static server) are still running**: They are not used by the UI after this feature. Operators who still rely on the static-server CLI for legacy purposes can run it on its existing port; the UI ignores it.
- **A user requests a deep link to another user's resource (e.g., `/runs/<id>` where the id belongs to someone else)**: UI returns "not found" — does not leak existence.
- **No saved configurations yet for a brand-new user**: The system auto-seeds a "default" config the first time the user successfully authenticates (clarification 2026-05-31 / Q4). The user can start a backtest immediately on first sign-in without any out-of-band setup. The seeded config mirrors the bundled `backend/config/config.yaml` shape.
- **The backend is down**: The connection-status indicator in the topbar turns red. The sign-in page still works (Supabase Auth is a separate service); but starting a backtest is refused with a clear "service unavailable" message.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The UI MUST present a sign-in page as the first interaction for any unauthenticated visitor, regardless of which URL they originally requested. The system MUST preserve the original destination and return the user there after a successful sign-in.
- **FR-002**: The UI MUST support sign-in via a one-time code delivered to the user's email. Both the magic-link path AND the typed-code path are acceptable; the UI MUST accept whichever the user uses.
- **FR-003**: The UI MUST support a second authentication factor (time-based one-time password via authenticator app). On first sign-in for a user without an enrolled factor, the UI MUST prompt for enrollment before granting access to protected pages. On subsequent sign-ins for an enrolled user, the UI MUST prompt for the second-factor code.
- **FR-004**: The UI MUST surface backup codes during second-factor enrollment and MUST require the user to acknowledge they've saved them before completing enrollment.
- **FR-005**: The UI MUST provide a sign-out action that clears the user's session and routes the user to the sign-in page.
- **FR-006**: Every page that displays user-owned data (runs, trades, signals, journal events, data-download jobs) MUST scope its results to the authenticated user. The UI MUST NEVER display another user's data, even when the user supplies another user's resource identifier in the URL.
- **FR-007**: The UI MUST allow an authenticated user to trigger a new backtest by selecting a saved configuration and clicking a single action. The trigger MUST return a result within a couple of seconds regardless of how long the backtest itself runs.
- **FR-008**: The UI MUST reflect a run's lifecycle (`queued`, `running`, `finished`, `failed`) without requiring a manual page refresh. New runs appear in the runs list immediately on creation; state transitions become visible within a couple of seconds of the underlying state changing. Status updates use adaptive polling (clarification 2026-05-31 / Q1): resources in `queued` or `running` state are polled every 1 second; resources in terminal states (`finished` or `failed`) are polled every 30 seconds; resources visible in the current view are polled directly, AND the user's own in-flight runs are background-polled regardless of current view (cap 3 concurrent, clarification 2026-05-31 / Q2). When the user returns to a page that displays a previously-tracked run, the status shown reflects the latest poll result.
- **FR-009**: When a run is in the `failed` state, the UI MUST display the failure reason in plain text and offer a clear path to start a new run.
- **FR-010**: The UI MUST present a strategy selector that lists every enabled strategy from the registry. The UI MUST NOT hardcode any specific strategy. Adding a new strategy to the registry MUST cause it to appear in the selector after the next page load.
- **FR-011**: The UI MUST allow an authenticated user to trigger a historical-data download by submitting a date range. The submission MUST return immediately; the job's progress MUST be observable via a status display in the data-downloads panel.
- **FR-012**: A successful data-download job's output MUST be selectable as input data when starting a subsequent backtest.
- **FR-013**: The UI MUST display a connection-status indicator that visibly reflects whether the backend service is reachable. When the service is unreachable, user actions that depend on it MUST fail with a clear "service unavailable" message rather than appearing to succeed.
- **FR-014**: Every newly-introduced UI concept (the second authentication factor, backup codes, the run lifecycle states, saved configurations, the strategy registry, the data-download job, the cloud-push concept) MUST ship with an inline explanation that answers: "What is this? Why does it matter? How is the app using it?"
- **FR-015**: The UI MUST NOT expose any control that enables live trading. The pre-existing constraint that live trading is disabled by default at the data layer remains in force; the UI MUST NOT provide any way to override it.
- **FR-016**: The UI MUST NOT expose a control to select an instrument other than the one currently supported (SPY) or a direction other than long. The instrument and direction are inherent to each strategy in the registry; the UI inherits them.
- **FR-017**: After this feature ships, the UI MUST NO LONGER depend on the pre-feature local-file static endpoints. The previous local-only data path MUST be replaced by the authenticated cloud-backed data path. The pre-feature endpoints MAY remain in the codebase (operators may still invoke them via CLI), but the UI does not point at them.
- **FR-018**: The UI MUST allow deep linking to specific resources (a particular run, a particular trade view, the strategies registry, etc.). Deep links to resources the user owns MUST resolve correctly; deep links to resources the user does not own MUST resolve to a "not found" view.
- **FR-019**: When the user's session expires during interactive use, the UI MUST detect this on the next protected request, redirect to sign-in with the current path preserved, and after re-authentication MUST restore the user to where they were. Background access-token refreshes that fail MUST be retried up to 3 times with exponential backoff (1s → 2s → 4s) before the system treats the session as expired and triggers this flow (clarification 2026-05-31 / Q5). Transient network failures during refresh MUST NOT kick the user out.
- **FR-020**: When the user signs out in one browser tab, every other open tab MUST detect the sign-out within milliseconds and redirect to the sign-in page (clarification 2026-05-31 / Q3). The detection MUST NOT depend on the other tab making a backend request first — it MUST fire on the auth-state-change event regardless of activity.
- **FR-021**: The system MUST ensure every authenticated user has at least one saved configuration available before they reach the "Start Backtest" surface (clarification 2026-05-31 / Q4). A brand-new user's first sign-in MUST trigger creation of a starter "default" configuration mirroring the bundled `backend/config/config.yaml` shape. The user MUST NOT be required to perform any out-of-band setup (CLI invocation, dashboard edit, etc.) to run their first backtest.

### Key Entities

- **Session**: The authenticated identity associated with the current browser context. Created on sign-in, cleared on sign-out, automatically refreshed in the background while active, and expires after a documented inactivity window. Carries the user's identity for all subsequent backend calls.
- **Second-factor enrollment**: A record that the user has registered an authenticator app for second-factor authentication. Includes a secret (held by the authenticator app, never displayed after enrollment) and a set of single-use backup codes that the user must save during enrollment.
- **Strategy** *(extends Feature 005)*: A registered backtest strategy with a stable display name and description. The UI lists every enabled strategy in the selector; selection determines which engine logic will run when the user starts a backtest. New strategies appear automatically when the registry grows.
- **Run** *(extends Feature 006)*: A backtest invocation visible to the user. Carries a lifecycle status (`queued`, `running`, `finished`, `failed`). The UI subscribes to status changes and updates the displayed state as the underlying lifecycle progresses.
- **Data-download job** *(extends Feature 006)*: A request to fetch historical data for a date range. Mirrors the run lifecycle. On completion, the resulting data becomes selectable in the backtest-start UI.
- **Connection status**: The UI's belief about whether the backend service is reachable. Updated periodically via a health probe; visible in the topbar as a status indicator.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor can go from "open the app" to "viewing my runs page" in under 3 minutes, including email delivery, code entry, and second-factor enrollment.
- **SC-002**: An authenticated user can trigger a backtest, watch it complete, and view its results in under 2 minutes on the bundled fixture (without manual refresh).
- **SC-003**: 100% of attempts to view another user's resource (by deep-link or by URL hacking) return "not found"; never a 403, never the resource itself. Verified by automated test against every user-scoped route.
- **SC-004**: New strategies added to the registry appear in the UI's strategy selector after a page refresh, with no UI code change. Verified by adding a synthetic strategy row in test, refreshing, and asserting it appears.
- **SC-005**: When the backend is unreachable, the UI shows a clear "service unavailable" indicator within 5 seconds of the first failed request, and user actions that require the backend fail with clear error messages instead of silent failure.
- **SC-006**: When a user's session expires mid-session, the UI redirects them to sign-in, restores their original destination after re-auth, and they lose no in-flight context (e.g., a partially filled form is preserved or clearly re-presentable).
- **SC-007**: After this feature ships, every existing Feature 003 test that exercised the pre-feature UI either (a) still passes against the migrated UI or (b) is explicitly retired with a documented replacement, with zero tests left in an "unknown state."
- **SC-008**: Every newly-introduced concept in the UI (second factor, backup codes, run lifecycle, strategy registry, data download, etc.) has an inline explanation visible to the user without leaving the page they're on. Verified by checklist: every concept label has a paired help-tooltip element.

## Assumptions

- The cloud authentication provider, the cloud data layer, and the authenticated HTTP backend (Features 005 + 006) are operational and reachable from wherever the UI is served.
- The user has access to an authenticator app (Google Authenticator, 1Password, etc.) for second-factor enrollment.
- Existing saved configurations are created via the CLI push path (Feature 005) or via the HTTP API (Feature 006); this feature does NOT add UI for creating configurations. Empty-state UX directs the user to that out-of-band path.
- The frontend is served from a single origin (locally `http://localhost:5173` for development; production deploy lands in Feature 008).
- The UI is interactive on a modern desktop browser (latest two versions of Chrome/Firefox/Safari/Edge). Mobile-responsive design is out of scope for this feature.
- "Real time" status updates are achieved by short polling (1-2 second intervals); push/streaming is not required for the MVP.

## Out of Scope

The following items belong to later features and MUST NOT be addressed here:

- Production deployment to the chosen hosting provider (Feature 008).
- Adding NEW backtest strategies to the registry. The UI's strategy selector lists what's there; adding rows requires a code+migration change.
- Live-trading UI of any kind. The `live_auto_enabled` field remains hard-pinned to FALSE at the data layer and the UI does NOT provide any control to flip it.
- Mobile-responsive layout. Desktop only in this feature.
- Real-time push streaming (websockets / Server-Sent Events). Polling suffices.
- Account self-service: profile editing, email change, password recovery flows beyond second-factor backup codes. The simple email-OTP + second-factor flow is the entirety of the auth surface.
- UI for creating, editing, or deleting saved configurations. Configs come from the CLI push or HTTP API.
- Per-user notifications (push, email, in-app toasts beyond errors). Out of scope.
- Admin features (impersonation, user management, etc.).
