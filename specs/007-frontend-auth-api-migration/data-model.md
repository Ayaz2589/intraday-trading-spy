# Phase 1 Data Model — Web UI with Sign-In + Cloud-Backed Run Inspection

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

This feature is UI-shaped. Almost all of its "data model" is **client-side state** (router, query cache, auth context, background-runs tracker) rather than database tables. One small backend addition: a Postgres trigger that auto-seeds a starter config for every newly-created user (FR-021 / clarification Q4).

## 1. Client-side state model

### 1.1 Auth context (`frontend/src/auth/AuthProvider.tsx`)

| Field | Type | Notes |
|---|---|---|
| `session` | `Session \| null` | supabase-js session; `null` when signed out |
| `user` | `User \| null` | derived from `session.user`; convenience accessor |
| `isLoading` | `boolean` | true during initial session-load on app mount |
| `signInWithOtp` | `(email: string) => Promise<void>` | calls `supabase.auth.signInWithOtp({ email })` |
| `verifyOtp` | `(email: string, token: string) => Promise<{ requiresMfa: boolean }>` | calls `supabase.auth.verifyOtp`, returns whether to route to MFA challenge |
| `signOut` | `() => Promise<void>` | clears session; cross-tab event fires automatically |
| `enrollMfa` | `() => Promise<{ qrCodeUrl: string, secret: string, backupCodes: string[] }>` | initiates TOTP enrollment |
| `confirmMfaEnrollment` | `(code: string) => Promise<void>` | finalizes enrollment |
| `challengeMfa` | `(code: string) => Promise<void>` | TOTP challenge during sign-in |
| `useBackupCode` | `(code: string) => Promise<void>` | backup-code fallback for lost authenticator |

State transitions (the only state machine in this feature):

```
(no session)
   │
   │ signInWithOtp(email)
   ▼
(awaiting OTP)
   │
   │ verifyOtp(email, token)
   ▼
(authenticated, no MFA enrolled)         (authenticated, MFA enrolled)
   │                                        │
   │ enrollMfa + confirm                    │ challengeMfa
   ▼                                        ▼
(authenticated, aal2)                    (authenticated, aal2)
   │
   │ signOut (any tab)
   ▼
(no session)   [Q3: redirect every tab to /sign-in]
```

### 1.2 Background runs tracker (`frontend/src/lib/active-runs-tracker.ts`)

Implements Q2 — keeps polling the user's own in-flight runs regardless of which page is in view.

| Field | Type | Notes |
|---|---|---|
| `entries` | `Map<UUID, { startedAt: number; lastStatus: RunStatus }>` | LRU; max 3 |
| `cap` | `number` | 3 (constant from `frontend/src/config.ts`) |
| `track` | `(runId: UUID) => void` | called on POST /api/backtests success |
| `untrack` | `(runId: UUID) => void` | called when a tracked run reaches a terminal state |
| `entryIds` | `UUID[]` | ordered most-recent-first |
| `subscribe` | `(callback) => () => void` | for `useSyncExternalStore` |

Eviction: when `track(id)` is called and `entries.size === cap`, evict the oldest entry (no notification — the run keeps running in the backend; only the foreground tracking stops).

### 1.3 Query keys (TanStack Query cache)

| Key | Resource | Adaptive polling? | Notes |
|---|---|---|---|
| `['runs', { limit, cursor }]` | `GET /api/runs` | static 5000ms | List view |
| `['run', runId]` | `GET /api/runs/{id}` | adaptive (Q1) | Detail view |
| `['runStatus', runId]` | `GET /api/runs/{id}/status` | adaptive (Q1) | Used by tracker + detail page |
| `['runTrades', runId, { limit, cursor }]` | `GET /api/runs/{id}/trades` | none | Static after finished |
| `['runSignals', runId, { executed, limit, cursor }]` | `GET /api/runs/{id}/signals` | none | Static after finished |
| `['runJournal', runId, { limit, cursor }]` | `GET /api/runs/{id}/journal` | none | Static after finished |
| `['strategies']` | `GET /api/strategies` | 60s | Cache-friendly registry |
| `['health']` | `GET /healthz` | 10s | Connection-status indicator |
| `['dataDownloadJob', jobId]` | `GET /api/data/downloads/{id}` | adaptive (Q1) | Mirrors run status semantics |

Cursor pagination per Feature 006's opaque-cursor contract (clarification Q2 there). Each list query stores its cursor in the URL search params via TanStack Router so deep-links work (FR-018).

## 2. New entities (FR-021)

The auto-seed-default-config trigger needs one DB function + one trigger. No new tables.

Migration: `backend/db/migrations/0070_seed_default_config_on_signup.sql`

```sql
CREATE OR REPLACE FUNCTION public.seed_default_config_for_user(uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    strategy_id_v UUID;
BEGIN
    SELECT id INTO strategy_id_v FROM public.strategies WHERE key = 'vwap_pullback_long';
    IF strategy_id_v IS NULL THEN
        RAISE EXCEPTION 'seed_default_config_for_user: vwap_pullback_long not in registry';
    END IF;

    INSERT INTO public.configs (user_id, strategy_id, name, mode, params)
    VALUES (
        uid,
        strategy_id_v,
        'default',
        'backtest',
        '{
            "max_risk_per_trade": 0.01,
            "max_daily_loss": 0.02,
            "max_trades_per_day": 3,
            "max_consecutive_losses": 2,
            "cooldown_after_loss_minutes": 15,
            "no_new_trades_cutoff": "15:30",
            "force_flat_time": "15:55",
            "opening_range_minutes": 15,
            "position_value_cap": 50000.0
        }'::jsonb
    )
    ON CONFLICT (user_id, name) DO NOTHING;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_seed_config ON auth.users;
CREATE TRIGGER on_auth_user_created_seed_config
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.seed_default_config_for_user(NEW.id);
```

**Idempotency**: `CREATE OR REPLACE FUNCTION` + `DROP TRIGGER IF EXISTS` + `ON CONFLICT DO NOTHING`. Safe to re-apply.

**Test obligations** (in `backend/tests/storage/test_default_config_trigger.py`, marked `integration`):
- Insert a new user → assert exactly one `configs` row exists for them with `name = 'default'`.
- Insert the same user twice (`ON CONFLICT DO NOTHING` semantics) → row count remains 1.
- Migration is idempotent: applying it twice in a row works.

## 3. Validation rules cross-referenced to spec

| Spec FR | Client-state / backend element |
|---|---|
| FR-001 (sign-in gate) | TanStack Router `_authenticated.tsx` `beforeLoad` checks `AuthProvider.session` |
| FR-002 (OTP sign-in) | `AuthProvider.signInWithOtp` + `verifyOtp` calls supabase-js |
| FR-003 (MFA enrollment + challenge) | `AuthProvider.enrollMfa` + `confirmMfaEnrollment` + `challengeMfa` |
| FR-004 (backup codes) | `enrollMfa` returns codes; UI requires acknowledgement checkbox before completing enrollment |
| FR-005 (sign-out) | `AuthProvider.signOut` → fires cross-tab event |
| FR-006 (user-scope) | RLS on backend (Feature 005) + FastAPI 404 for cross-user (Feature 006) |
| FR-007 (start backtest in 1s) | `POST /api/backtests` returns 202 immediately; query cache updates with new run |
| FR-008 (adaptive polling) | `useRunStatus` hook with `refetchInterval: adaptivePollingInterval` (research §8) |
| FR-009 (failed → reason) | `RunStatusResponse.failure_reason` from Feature 006 surfaced in UI |
| FR-010 (strategy selector from registry) | `useStrategies()` hook → reads `GET /api/strategies` |
| FR-011 (data download) | `useStartDataDownload` mutation + `useDataDownloadJob` polling |
| FR-012 (downloaded data selectable) | `StartBacktestDialog` data-picker queries finished `data_download_jobs` |
| FR-013 (connection status) | `useHealth()` 10s polling; topbar dot reflects result |
| FR-014 (help tooltips) | Every new concept has a `<HelpTooltip>` from Feature 003; see `contracts/help-tooltips.md` |
| FR-015 (no live_auto_enabled UI) | Type guard: API response schemas omit the field; lint rule rejects mentions in tsx |
| FR-016 (no symbol/direction UI) | StartBacktestDialog has no symbol or direction inputs |
| FR-017 (retire static path) | Old `frontend/src/api/static-*.ts` files deleted; new `api/client.ts` points at `VITE_API_BASE_URL` |
| FR-018 (deep linking) | TanStack Router file-based routes + search params |
| FR-019 (session expiry preservation) | `_authenticated.tsx` beforeLoad navigates to `/sign-in?next=<current>` on no-session |
| FR-020 (cross-tab sign-out) | `AuthProvider` `onAuthStateChange` listener routes to `/sign-in` on `SIGNED_OUT` |
| FR-021 (auto-seed default config) | Postgres trigger in migration 0070 |
