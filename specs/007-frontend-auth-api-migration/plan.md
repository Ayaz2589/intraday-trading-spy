# Implementation Plan: Web UI with Sign-In + Cloud-Backed Run Inspection

**Branch**: `007-frontend-auth-api-migration` | **Date**: 2026-05-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-frontend-auth-api-migration/spec.md`

**Cross-feature design**: [`docs/migrations/2026-05-30-supabase-vercel-migration.md`](../../docs/migrations/2026-05-30-supabase-vercel-migration.md) — feature 3 of 4 in the cloud migration.

**Clarifications applied** (see [spec.md §Clarifications](./spec.md#clarifications)):
- **Q1** Adaptive polling: 1s in-flight, 30s terminal, visible-only.
- **Q2** Background-poll user's in-flight runs (cap 3) regardless of current view.
- **Q3** Cross-tab sign-out via `auth-state-change` event — immediate redirect.
- **Q4** Auto-seed "default" config on first sign-in (no out-of-band setup).
- **Q5** Refresh-token failure: 3 retries with 1s/2s/4s backoff, then FR-019 session-expired flow.

## Summary

Replace the existing operator-only static-file React UI with an authenticated multi-user web app that signs users in via Supabase email OTP + TOTP MFA, fetches their cloud-backed runs/trades/signals/journal via Features 005-006, and triggers new backtests through Feature 006's `POST /api/backtests`. Keep the existing design-system foundation (React + TypeScript + Vite + Tailwind + shadcn/ui from Features 003/004) and migrate routing to **TanStack Router** for nested layouts, type-safe params, and integrated auth gates. Add **TanStack Query** for cache + polling + background refetch (clarification Q1 + Q2). The pre-feature static-file `/api/runs/*` data path is retired from the UI; the standalone `intraday-trade-spy-server` console script remains for legacy ops but the UI does not call it.

## Technical Context

**Language/Version**: TypeScript ≥ 5.x (existing). React 18.x (existing). Node ≥ 18 for the toolchain (existing).

**Primary Dependencies** (existing in `frontend/package.json`):
- `react`, `react-dom`, `react-router` (to be removed), `klinecharts`, `@radix-ui/*`, `class-variance-authority`, `clsx`, `lucide-react`, `tailwind-merge`
- Dev: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `happy-dom`, `vite`, `tailwindcss`

**Primary Dependencies** (new in this feature):
- `@supabase/supabase-js@^2.45` — auth + RLS-scoped reads from Postgres
- `@tanstack/react-router@^1.x` — type-safe routing, route guards, search-param state
- `@tanstack/react-query@^5.x` — data fetching, cache, polling (Q1), background refetch (Q2)
- `qrcode.react@^4.x` — render the TOTP enrollment QR code (FR-003)
- Dev: `@tanstack/router-devtools`, `@tanstack/react-query-devtools` (dev-only); `msw@^2.x` to mock supabase-js + the fetch wrapper in Vitest unit tests

**Removed dependencies**:
- `react-router` — replaced by `@tanstack/react-router`

**Storage**:
- Browser `localStorage` — supabase-js's default session storage (access_token + refresh_token). Standard SPA pattern.
- No new persistent storage in this feature.

**Testing**:
- `vitest` + `@testing-library/react` (existing) for unit tests of every new component/hook
- `msw` (new) to mock the FastAPI fetch + supabase-js HTTP calls deterministically
- `@pytest.mark.api` carve-out preserved for any backend changes in this feature
- Existing Feature 003 tests stay; some are retired with a documented replacement (SC-007)

**Target Platform**:
- Development: `localhost:5173` (Vite dev server) talking to `localhost:8001` (Feature 006 API)
- Production-readiness: deployable to Vercel via standard Vite build output (`vite build` → `dist/`). Actual deploy lands in Feature 008.

**Project Type**: Web app evolution — the existing `frontend/` directory is restructured around TanStack Router file-based routes. No new top-level project.

**Performance Goals**:
- First-time sign-in to runs page in under 3 minutes (SC-001)
- Trigger → completion of a backtest visible in UI in under 2 minutes (SC-002)
- Cross-tab sign-out detection in milliseconds (FR-020)
- Status updates surface within 1 second of state change (FR-008 / Q1)

**Constraints**:
- Live trading UI is hard-blocked (FR-015) — no control surface for `live_auto_enabled`
- Symbol / direction inherited from strategies registry (FR-016) — no UI selectors
- The pre-feature static endpoints are retired from the UI's data path (FR-017)
- Mobile-responsive layout is OUT of scope; desktop-only
- Polling (not websockets) per spec assumption
- Constitution principle VI: every new concept gets a `HelpTooltip`

**Scale/Scope**:
- Single-user-per-session (multi-user means many such sessions; no per-tenant cross-talk)
- Background polling cap of 3 concurrent in-flight runs per user (Q2)
- ~12-15 new route components, ~6-8 new hooks, 4 new feature panels (sign-in, MFA, runs, downloads)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source of truth: `.specify/memory/constitution.md` (v1.1.0).

| # | Principle | Touched? | How this plan complies |
|---|-----------|----------|------------------------|
| I | SPY-Only Instrument (NON-NEGOTIABLE) | yes | No symbol selector in the UI (FR-016). Strategy selector reads from the registry which is SPY-only by DB CHECK (Feature 005). UI never accepts a symbol parameter from the user. |
| II | Long-Only, Rule-Based v1 (NON-NEGOTIABLE) | yes | No direction selector (FR-016). Strategy selector lists only `direction='LONG'` + `kind='rule_based'` strategies (DB enforces this). UI tests assert that a hand-crafted body with `direction: SHORT` is rejected at the API boundary. |
| III | Risk Manager Has Absolute Veto (NON-NEGOTIABLE) | no (engine unchanged) | The UI calls the existing Feature 006 endpoints; the engine + risk manager are unchanged. No UI control bypasses or overrides risk decisions. |
| IV | Test-First Everywhere (NON-NEGOTIABLE) | yes | Every `frontend/src/**/*.{ts,tsx}` file added or modified has a preceding failing Vitest test. Auth flow, route guards, hooks, components, MFA enrollment, polling logic — all TDD-paired. Test taxonomy: `frontend/src/**/*.test.{ts,tsx}` colocated with implementation, plus `frontend/src/__tests__/` for cross-cutting integration tests. |
| V | Paper-First, Live Trading Disabled by Default (NON-NEGOTIABLE) | yes | No UI control for `live_auto_enabled` (FR-015). The UI's TypeScript types do not include this field on the runs/configs API surface (the response schemas omit it). Tests assert that no UI element accepts the boolean. |
| VI | Educational UI: Every Concept Is Explained | yes | FR-014 + SC-008 require a `HelpTooltip` on every new concept (MFA, TOTP, OTP, backup codes, session, saved config, strategy registry, backtest queue, run status, cloud push, data-download job). PR review for any new UI label rejects missing tooltips. Test: a structural unit test scans the rendered component tree for un-tooltip'd concept labels. |
| VII | Journal Everything | no | The journal is the backend's responsibility. The UI displays journal events but doesn't write them. No new code path in this feature touches `journal_events` writes. |

**Engineering standards check:**

- [x] Timezone is `America/New_York` for any new time logic; `clock.py` is consulted, not reimplemented. *(N/A in this feature; UI shows timestamps as the user's local time + `America/New_York` reference. No business-time decisions in the frontend.)*
- [x] Any new limits, thresholds, or session times added live in `backend/config/config.yaml`, not in source. *(The 1s / 30s polling cadences and the 3-run background tracker cap live in a new `frontend/config.ts` constants module — frontend-side analog. Backend session expiry uses Supabase's defaults; no new backend limits.)*
- [x] Backend code is Python ≥3.11 / FastAPI / Pydantic v2 / pytest. *(Mostly N/A; one small backend addition for FR-021 — the auto-seed-default-config Supabase Auth trigger lives in `backend/db/migrations/0070_seed_default_config_on_signup.sql`. Tests cover it via the existing `tests/storage/` integration suite.)*
- [x] Frontend code is React + TypeScript + Vite + Tailwind. *(Confirmed. Adds TanStack Router + TanStack Query within the existing stack.)*

**Constitutional amendment required**: none. No NON-NEGOTIABLE principle changes.

All seven principles honored. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/007-frontend-auth-api-migration/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (client-side state + one backend migration)
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── routes.md        # Route tree, guards, public/protected matrix
│   ├── auth-flow.md     # Sign-in / MFA / sign-out / refresh state machine
│   ├── data-fetching.md # supabase-js vs FastAPI split, hook surface
│   └── help-tooltips.md # Concept → tooltip text mapping (constitution VI)
└── tasks.md             # Phase 2 output (NOT created by /speckit-plan)
```

### Source Code (repository root)

The existing monorepo is extended:

```text
frontend/
├── src/
│   ├── main.tsx                          # MODIFIED — wraps app in TanStack Router + Query providers + AuthProvider
│   ├── App.tsx                           # REMOVED — replaced by routes/__root.tsx
│   ├── routes/                           # NEW — TanStack Router file-based routes
│   │   ├── __root.tsx                    # Root layout: topbar + outlet + connection-status + QueryDevtools
│   │   ├── index.tsx                     # / → redirect to /runs
│   │   ├── sign-in/
│   │   │   ├── index.tsx                 # /sign-in — email entry → OTP entry → MFA challenge
│   │   │   ├── callback.tsx              # /sign-in/callback — handles magic-link redirect
│   │   │   └── mfa.tsx                   # /sign-in/mfa — TOTP code prompt + backup-code fallback
│   │   ├── _authenticated.tsx            # Layout: route guard for everything below
│   │   ├── _authenticated.runs.tsx       # /runs — runs list + Start Backtest button
│   │   ├── _authenticated.runs.$runId.tsx # /runs/$runId — detail (trades / signals / journal / summary)
│   │   ├── _authenticated.strategies.tsx # /strategies — registry list with HelpTooltips
│   │   ├── _authenticated.data.tsx       # /data — download jobs list + new-job form
│   │   └── _authenticated.mfa-enroll.tsx # /mfa-enroll — TOTP enrollment + backup codes (forced on first sign-in)
│   ├── auth/                             # NEW
│   │   ├── supabase-client.ts            # Singleton Supabase JS client (browser-safe)
│   │   ├── AuthProvider.tsx              # React context: session, user, sign-in/out actions, refresh-retry
│   │   ├── useAuth.ts                    # Hook to read AuthProvider context
│   │   ├── route-guards.ts               # TanStack Router beforeLoad helpers
│   │   ├── refresh-retry.ts              # Q5 — bounded refresh-retry with backoff
│   │   └── cross-tab.ts                  # Q3 — auth-state-change → cross-tab redirect
│   ├── api/                              # MODIFIED — was Feature 003's static-file client; now typed FastAPI wrapper
│   │   ├── client.ts                     # NEW — fetch wrapper, attaches Authorization header, error mapping
│   │   ├── runs.ts                       # NEW — typed wrappers for GET /api/runs[/...]
│   │   ├── backtests.ts                  # NEW — typed wrapper for POST /api/backtests
│   │   ├── strategies.ts                 # NEW — typed wrapper for GET /api/strategies
│   │   ├── data-downloads.ts             # NEW — typed wrappers for POST /api/data/download + GET /api/data/downloads/{id}
│   │   ├── health.ts                     # NEW — typed wrapper for GET /healthz (no auth)
│   │   └── (legacy files removed)        # Old static-file API client deleted
│   ├── hooks/                            # NEW — TanStack Query hooks
│   │   ├── useRuns.ts                    # GET /api/runs (paginated, adaptive polling Q1)
│   │   ├── useRun.ts                     # GET /api/runs/{id}
│   │   ├── useRunStatus.ts               # GET /api/runs/{id}/status (in-flight polling Q1)
│   │   ├── useRunTrades.ts               # GET /api/runs/{id}/trades
│   │   ├── useRunSignals.ts              # GET /api/runs/{id}/signals (executed=false toggle)
│   │   ├── useRunJournal.ts              # GET /api/runs/{id}/journal
│   │   ├── useStrategies.ts              # GET /api/strategies
│   │   ├── useStartBacktest.ts           # POST /api/backtests mutation + tracker registration
│   │   ├── useStartDataDownload.ts       # POST /api/data/download mutation
│   │   ├── useDataDownloadJob.ts         # GET /api/data/downloads/{id}
│   │   └── useHealth.ts                  # GET /healthz (connection-status indicator)
│   ├── lib/
│   │   ├── active-runs-tracker.ts        # NEW — Q2 background tracker (cap 3)
│   │   ├── polling.ts                    # NEW — Q1 adaptive refetchInterval helpers
│   │   └── (existing utilities)          # cn(), formatters, etc.
│   ├── components/                       # EXISTING + extended
│   │   ├── auth/                         # NEW
│   │   │   ├── SignInForm.tsx
│   │   │   ├── OtpCodeForm.tsx
│   │   │   ├── MfaEnrollment.tsx         # QR code, secret display, confirmation, backup codes
│   │   │   ├── MfaChallenge.tsx          # TOTP entry + "use backup code" link
│   │   │   └── SignOutMenu.tsx
│   │   ├── runs/                         # NEW
│   │   │   ├── RunsList.tsx
│   │   │   ├── RunRow.tsx                # Status badge (queued/running/finished/failed)
│   │   │   ├── RunDetail.tsx
│   │   │   ├── RunSummaryCards.tsx       # (reuses existing summary components)
│   │   │   ├── TradesTable.tsx
│   │   │   ├── SignalsTable.tsx          # Tabs: executed | rejected
│   │   │   ├── JournalTable.tsx
│   │   │   └── StartBacktestDialog.tsx   # Strategy + config + data picker
│   │   ├── strategies/
│   │   │   ├── StrategyList.tsx
│   │   │   └── StrategyCard.tsx
│   │   ├── data/
│   │   │   ├── DataDownloadsList.tsx
│   │   │   ├── DataDownloadForm.tsx
│   │   │   └── DataDownloadStatus.tsx
│   │   ├── topbar.tsx                    # MODIFIED — adds user menu, sign-out, connection status, current strategy
│   │   ├── connection-status.tsx         # NEW — green/red dot polling /healthz
│   │   └── HelpTooltip.tsx               # EXISTING (Feature 003) — reused
│   ├── styles/
│   │   └── globals.css                   # EXISTING (may add a couple of utility classes)
│   ├── config.ts                         # NEW — typed env + constants (polling, caps, retry)
│   └── env.ts                            # NEW — import.meta.env type guards
├── package.json                          # MODIFIED — adds supabase-js, tanstack/router, tanstack/query, qrcode.react, msw
├── vite.config.ts                        # MODIFIED — adds env var validation, optional router devtools
├── tsconfig.app.json                     # MODIFIED — picks up the new routes structure (if needed)
├── .env.example                          # NEW — VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_BASE_URL
└── manual-tests/
    └── MFA_FLOW.md                       # NEW — end-to-end MFA enrollment + sign-in runbook (parallel to Feature 005's)

backend/
├── db/migrations/
│   └── 0070_seed_default_config_on_signup.sql   # NEW — Supabase Auth trigger to auto-create starter config (FR-021)
└── (existing — unchanged)
```

**Structure Decision**: Keep the existing `frontend/` layout. The biggest change is moving from `react-router` to `@tanstack/react-router` with **file-based routes** under `frontend/src/routes/`. File-based routing makes nested layouts (root → authenticated layout → page) cleanly expressible and gives type-safe params + search params for free.

The auto-seed-default-config logic (FR-021, Q4) lives in the backend as a Supabase Auth trigger — when `auth.users` gains a new row, a trigger inserts a starter config for that user using the bundled `config.yaml` shape. This keeps the UI simple (no "first sign-in" branch) at the cost of one new SQL migration.

The existing `intraday-trade-spy-server` (static-file FastAPI) is NOT removed from the codebase by this feature — only retired from the UI's data path. Operators may still invoke it from the CLI if they want to inspect local-only backtests.

## Complexity Tracking

No NON-NEGOTIABLE principle is violated; this table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| *(none)* | | |
