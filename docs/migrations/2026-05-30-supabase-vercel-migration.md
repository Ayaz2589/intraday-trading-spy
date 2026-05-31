# Supabase + Vercel Migration — Architectural Design

**Date**: 2026-05-30
**Status**: Draft — pending user approval before formal Spec Kit features begin
**Scope**: Move `intraday-trade-spy` from a single-user, local-only research CLI + viewer to a multi-user web application hosted on Supabase (data + auth + storage), Fly.io (compute), and Vercel (frontend), while preserving every constitutional invariant.

This document is the cross-feature design that decomposes into four sequential Spec Kit features (005 through 008). Each feature gets its own `spec.md`, `plan.md`, and `tasks.md`. This document is the source of architectural intent that those four features inherit.

---

## 1. Motivation

The MVP is feature-complete: a SPY-only VWAP-pullback long backtester with a risk manager, journal, CLI runner, and React viewer (Features 001–004). To extend the project — multiple users, multiple strategies, persistent research history, eventual paper-trading via Alpaca — the storage and serving layers need to leave the local filesystem.

**Goals**

1. **Multi-user from day one.** Anyone with a login can run backtests scoped to their own account.
2. **Persistent research history in Postgres.** Runs, trades, signals, and journal events live in a queryable database, not as files on a laptop.
3. **Cloud-hosted UI and compute.** Anyone with the URL and a login can use the app from any device.
4. **Plug-in shape for future strategies.** The MVP ships with `vwap_pullback_long` only, but the schema and API are designed so adding a new strategy is one migration + one Python module — no architectural rework.
5. **Preserve every constitutional invariant.** No principle is relaxed. The existing tests that prove VWAP correctness, risk rejections, no future-bar peeking, and journal completeness continue to pass and gain Supabase-layer counterparts.

**Non-goals (v1 of the migration)**

- Live trading (still gated behind constitutional principle V; `live_auto_enabled: false` remains the default)
- Multi-symbol / non-SPY trading (still gated by principle I)
- Short selling / ML strategies (still gated by principle II)
- A public landing page / marketing site (the app remains login-gated)
- Mobile-native apps (web app accessed via mobile browser is fine)
- Real-time tick-level data feeds (5-minute bars remain the default timeframe)

---

## 2. Target Architecture

Three services, clear boundaries:

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (any authenticated user)                            │
└──────────────┬──────────────────────────────────┬───────────┘
               │ supabase-js                      │ fetch (Bearer JWT)
               ▼                                  ▼
┌──────────────────────────┐         ┌───────────────────────┐
│  Vercel                  │         │  Fly.io               │
│  Vite + React + Tailwind │         │  FastAPI service      │
│  TanStack Router         │         │  • validates JWT      │
│  shadcn/ui (existing)    │         │  • runs backtests     │
└──────────────┬───────────┘         │  • writes to Supabase │
               │                     └───────────┬───────────┘
               │ reads (RLS-scoped)              │ service-role
               ▼                                  ▼
        ┌─────────────────────────────────────────────┐
        │  Supabase                                    │
        │  • Postgres (runs, trades, signals, journal) │
        │  • Auth (email OTP + TOTP MFA)               │
        │  • Storage (raw SPY CSVs, run artifacts)     │
        │  • RLS (user_id-scoped on every table)       │
        └─────────────────────────────────────────────┘
```

### 2.1 Frontend — Vercel

- **Stack**: Vite + React + TypeScript + Tailwind + shadcn/ui (existing), plus **TanStack Router** for nested layouts and type-safe params (added in feature 007).
- **Why not Next.js**: FastAPI already provides the trusted server boundary. Next.js's killer features (Server Components, Server Actions, middleware auth) duplicate work FastAPI already does. The existing Vite frontend has been through 4 specs including a design-system adoption — rewriting is high cost, low return.
- **Deploys to Vercel** because Vercel deploys Vite + React zero-config and the existing frontend is already React.

### 2.2 Compute — Fly.io

- **Stack**: Python 3.11 + FastAPI + Pydantic v2, deployed as a single Docker container to Fly.io.
- **Why Fly.io**: Always-on container (no cold starts during a multi-minute backtest), predictable ~$0-5/mo pricing, one-command deploys (`flyctl deploy`), and no AWS complexity.
- **Why not Cloud Run / Lambda**: Backtests can run for minutes. Serverless platforms with per-request timeouts (10–30s typical) are a bad fit. Cloud Run also adds cold-start latency.
- **Why not "local CLI pushing to Supabase"**: With multi-user from day one, every user needs the ability to run a backtest from the UI without the developer present.

### 2.3 Data + Auth + Storage — Supabase

- **Postgres** holds all run metadata, trades, signals, journal events, configs, and the strategy registry. Schema is multi-tenant: every row carries `user_id` and every table has an RLS policy.
- **Auth** uses Supabase's **email OTP** flow (6-digit code emailed on each sign-in — no passwords) plus **TOTP MFA** for second-factor authentication. Suitable for a financial research app where credential security matters but the user base is small enough that OTP-per-login is acceptable friction.
- **Storage** holds raw historical SPY CSVs (yfinance output) and large run artifacts (manifest JSON, equity-curve snapshots).

### 2.4 The trust model

- **Browser ↔ Supabase (direct reads)**: Uses `supabase-js` with the authenticated user's JWT. RLS enforces row-level access. Used for fetching the user's runs, trades, journal — anything read-only.
- **Browser ↔ FastAPI (writes + compute)**: Authenticated browser sends Supabase-issued JWT as `Authorization: Bearer <jwt>`. FastAPI verifies the JWT (Supabase's JWKS endpoint or a shared secret) and extracts `user_id`.
- **FastAPI ↔ Supabase (writes)**: FastAPI uses Supabase's **service-role key** (bypasses RLS for performance). FastAPI is responsible for scoping every query/mutation by the validated `user_id`. This is the standard server-side pattern; the service-role key never leaves the FastAPI container.

---

## 3. Data Model (high-level)

Postgres tables (user-scoped tables carry `user_id uuid` with an RLS policy `user_id = auth.uid()`; the shared `bars` cache is read-public, write-restricted):

| Table | Purpose |
|---|---|
| `strategies` | Registry of available strategies. Seeded with `vwap_pullback_long`. Adding a strategy = adding a row + a Python module that imports it. |
| `configs` | Saved backtest configs per user. Replaces the single `config.yaml` checked into the repo. References a strategy. |
| `runs` | One row per backtest invocation. Links to config + strategy + date range. Stores summary metrics (P&L, Sharpe, win rate, max drawdown). |
| `trades` | Executed trades per run. |
| `signals` | Every signal generated, including rejected ones. **Required by principle VII** (rejected signals are first-class). |
| `journal_events` | Force-flat exits, risk decisions, errors, lifecycle events. Catch-all event stream. |
| `bars` | Cache of historical SPY 5-minute bars. Avoids re-downloading. Shared across users — read policy is open to all authenticated users; write policy only allows the FastAPI service role. |

Supabase Storage buckets:

| Bucket | Contents |
|---|---|
| `raw-data` | Uploaded SPY CSVs (yfinance output). User-scoped path. |
| `run-artifacts` | Manifest JSON, equity-curve PNGs, anything large enough to keep out of Postgres rows. User-scoped path. |

The Strategy registry pattern: each strategy module in `backend/src/intraday_trade_spy/strategies/` registers itself with a known key (e.g., `vwap_pullback_long`). Configs reference strategies by key. The `strategies` table is the source of truth for what keys exist. Adding a strategy is two PRs: one to add the Python module + register the key, one to insert the row.

---

## 4. Auth Flow

1. User visits the app → sees a login screen.
2. User enters email → Supabase sends a 6-digit OTP.
3. User enters OTP → Supabase returns a JWT.
4. **First-time login**: user is prompted to enroll in TOTP MFA (Google Authenticator, 1Password, etc.). Required before they can run a backtest.
5. **Subsequent logins**: user enters email + OTP + TOTP code.
6. JWT is stored in localStorage (standard SPA pattern); `supabase-js` handles refresh.
7. Every FastAPI call attaches the JWT as a Bearer token; every Supabase read goes through `supabase-js` which scopes via RLS.

**Token lifetime / refresh**: Supabase defaults (1-hour access token, refresh token rotated on use) are acceptable. No custom claims required for v1.

---

## 5. Feature Decomposition

The migration ships as four sequential Spec Kit features. Each is one full `specify → clarify → plan → tasks → analyze → implement` cycle, and each leaves the app working end-to-end (just on a smaller subset of the new stack).

### Feature 005 — Supabase Data Layer

**Outcome**: Supabase project exists, schema + RLS deployed, auth wired up at the data layer. Local backtest CLI gains `--push-to-supabase` flag.

**Scope**:
- Provision Supabase project (development environment first; production later)
- Define migrations for all tables in §3
- RLS policies on every table
- Seed `strategies` with `vwap_pullback_long`
- Storage buckets `raw-data` and `run-artifacts` with user-scoped path policies
- Auth configured: email OTP + TOTP MFA enabled
- New module `backend/src/intraday_trade_spy/storage/supabase_client.py` — thin Supabase wrapper for the backtest engine
- Backtest CLI accepts `--push-to-supabase`: after a run, results are written to `runs`, `trades`, `signals`, `journal_events`. Local file storage continues to work alongside.
- Tests: schema migrations apply cleanly, RLS denies cross-user reads, push-to-supabase round-trip writes and reads back the same data.

**The existing local-only workflow continues to work after this feature ships.** Users can still run the CLI without Supabase; the cloud is opt-in via the flag.

### Feature 006 — FastAPI Service Expansion

**Outcome**: The tiny FastAPI server becomes the real backend. Authenticated endpoints expose the backtest engine over HTTP.

**Scope**:
- JWT validation middleware (verifies Supabase JWT, extracts `user_id`)
- Endpoints:
  - `POST /api/backtests` — start a backtest, returns `run_id` immediately
  - `GET /api/runs` — list user's runs
  - `GET /api/runs/{id}` — run details
  - `GET /api/runs/{id}/status` — for polling long-running backtests
  - `POST /api/data/download` — kick off a yfinance fetch into Supabase Storage
  - `GET /api/strategies` — list registered strategies
- Backtests run as FastAPI `BackgroundTasks` for v1 (sufficient for single-instance Fly deployment; a queue can come later if needed)
- All writes scope by `user_id` from the validated JWT
- The existing static-file `/api/runs/*` endpoints used by Feature 003's UI are preserved during this feature to avoid breaking local dev, then removed in Feature 007.
- Dockerfile + `fly.toml` for deployment readiness (deployment itself happens in 008)
- Tests: JWT rejection, user_id scoping, every endpoint has an integration test against a local Supabase, BackgroundTasks completion writes to Supabase.

### Feature 007 — Frontend Auth + API Migration

**Outcome**: The frontend can sign users in, fetch their data from Supabase, and trigger backtests via FastAPI.

**Scope**:
- Add `supabase-js` + auth UI (email OTP entry, TOTP enrollment, TOTP challenge on subsequent logins)
- Route guards on protected pages
- Replace direct file-based API calls with:
  - Supabase reads via `supabase-js` for runs, trades, signals, journal (RLS-protected)
  - FastAPI POSTs for triggering backtests + downloads
- Add **TanStack Router** for nested layouts (sidebar + main + detail)
- Strategy selector UI (lays groundwork for multi-strategy)
- `HelpTooltip` (principle VI) on every new concept: "saved config", "strategy", "MFA", "backtest queue"
- Tests: auth flow (mock Supabase), route guards, API integration tests with mocked FastAPI

### Feature 008 — Production Deployment

**Outcome**: The app is live at a URL. Anyone with a login can use it from anywhere.

**Scope**:
- Fly.io account + app creation, secrets management
- Vercel account + project creation, environment variables
- Supabase project: production environment provisioned (dev environment from 005 continues to exist)
- CI/CD: GitHub Actions deploys `backend/` to Fly on tagged release, deploys `frontend/` to Vercel on push to `main`
- Production smoke tests: signup → backtest → view results
- Operational docs: how to roll back, where logs are, who pays the bills

---

## 6. Constitutional Impact

| Principle | Touched? | How |
|---|---|---|
| I. SPY-only | No | `market.symbol: SPY` constraint persists in DB-stored configs. Schema doesn't reference `symbol` columns. |
| II. Long-only, rule-based | No | Strategy registry only contains long-only rule-based strategies. Direction enum unchanged. |
| III. Risk manager veto | No (engine unchanged) | Risk manager keeps its absolute-veto role. RiskDecision still enforced before broker writes anything. |
| IV. TDD everywhere | **Yes** | All new code (Supabase client wrappers, FastAPI endpoints, auth, frontend) follows TDD per the constitution's expanded scope. |
| V. Paper-first | No | `live_auto_enabled: false` remains the default in shipped configs. Configs now live in Postgres but the flag remains. |
| VI. Educational UI | **Yes** | Every new UI concept (login flow, MFA, strategy selector, saved config) ships with a `HelpTooltip`. |
| VII. Journal everything | **Yes** | `journal/logger.py` gains a Supabase sink. Single-sink invariant preserved by ensuring the logger remains the only path to the `journal_events` table. |

**Engineering Standards** require a PATCH-level amendment to allow:
- Storage layer may be Supabase Postgres (not exclusively local files)
- Backend may be deployed (not exclusively local development)
- Frontend may be deployed (not exclusively local development)

This amendment lands as part of Feature 005's `plan.md` Constitution Check. No NON-NEGOTIABLE principle is changed; only the implementation-detail clauses in Engineering Standards expand.

---

## 7. Migration Safety

**Data preservation**: The existing local backtest runs (in `backend/data/backtests/`) are not migrated automatically. They remain readable by the existing CLI + viewer. A one-off script in Feature 005 can optionally upload them into Supabase for users who want their history preserved.

**Rollback**: Each feature is independently revertible.
- Revert Feature 005: schema migrations have a `down` path; auth setup is config-only
- Revert Feature 006: previous FastAPI revision is the static-file server
- Revert Feature 007: previous frontend revision uses local FastAPI
- Revert Feature 008: redeploy previous Vercel/Fly revisions

**Cost ceiling**: Free/cheap tiers throughout for the MVP. Expected monthly cost: ~$0-10 (Fly.io for FastAPI + Supabase Pro tier if free tier limits are hit + Vercel free tier). Hard ceiling enforced by tier choices; no auto-scaling.

---

## 8. Open Items (resolved during Spec Kit phases)

- **Exact RLS policy text** — drafted during Feature 005's `plan.md`
- **FastAPI background-task strategy** — Feature 006 decides BackgroundTasks vs. RQ+Redis based on observed backtest durations
- **Frontend state management** — Feature 007 decides whether TanStack Query + Zustand is enough or if a heavier store is needed
- **Production observability** — Feature 008 decides on log aggregation (Fly's built-in logs + Vercel Analytics suffice for MVP; Sentry / Grafana can come later)

---

## 9. Decisions Not Taken (rationale captured)

These options were considered and rejected during brainstorming. Captured here so future readers don't re-litigate:

- **Port the backend to TypeScript / Deno / Edge Functions** — Rejected. Loses pandas + numpy + alpaca-py ecosystem, introduces timezone/DST edge-case risk, throws away existing tests, requires a major constitutional amendment. Aesthetic upside ("one language") does not justify persistent downside.
- **Rewrite the backend in Go for lower latency** — Rejected. At 5-minute bars going through Alpaca's REST API, the dominant latency is network + broker routing (100ms+), not language overhead. Go's slippage benefits apply at sub-second / co-located strategies, not this one.
- **Switch the frontend to Next.js** — Rejected. Next.js's killer features assume the frontend is the trust boundary. FastAPI already plays that role. Migrating an existing Vite+React+Tailwind app with a recently-adopted design system is expensive for an aesthetic win.
- **One big migration feature instead of four** — Rejected. Per Spec Kit conventions and the constitution, each feature must be reviewable and ship a working app. A single mega-feature would produce an unreviewable `tasks.md`.
- **Email + password instead of OTP** — Rejected by user preference for stronger auth (OTP + MFA).
- **Local CLI pushing to Supabase, no deployed FastAPI** — Rejected because multi-user requires every user to run backtests independently of the developer.
