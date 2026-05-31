# Phase 0 Research — Web UI with Sign-In + Cloud-Backed Run Inspection

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Each entry: **Decision → Rationale → Alternatives considered**.

## 1. Router choice — TanStack Router

**Decision**: Replace `react-router` with `@tanstack/react-router@^1.x`. Adopt file-based routing under `frontend/src/routes/`.

**Rationale**:
- **Type-safe params + search params**: every `to: '/runs/$runId'` is type-checked at compile time. `useParams()` returns a known shape. Eliminates a whole class of runtime "param undefined" bugs.
- **Built-in `beforeLoad` route guards**: clean integration point for FR-001 (auth gate) and FR-018 (deep-link preservation) without HoCs or wrapper components.
- **Search-param state**: cursor pagination from Feature 006 (clarification Q2) maps naturally to typed search params on `/runs?cursor=...`.
- **Nested layouts**: `_authenticated.tsx` defines the protected-region layout once; every protected route lives under it.
- **First-class TanStack Query integration**: `loader` + `useQuery` share the same cache instance — no double-fetch on navigation.

**Alternatives considered**:
- **`react-router@7` (Remix-style)** — Also has loader semantics and good TS support, but parameter typing requires explicit Zod schemas everywhere. More boilerplate.
- **Stay with `react-router@6` (current)** — No route guards built in (HoC pattern needed). Param typing is unsafe.
- **Next.js App Router** — Was rejected in the brainstorming phase (Vercel + Vite + Tailwind already work; Next.js would be a frontend rewrite). Same conclusion holds.

## 2. Data fetching layer — TanStack Query

**Decision**: Adopt `@tanstack/react-query@^5.x` as the only data-fetching layer. Use it for both supabase-js reads AND FastAPI mutations.

**Rationale**:
- **Adaptive polling (Q1)**: `refetchInterval` accepts a function — return 1000 for in-flight states, 30000 for terminal, `false` to disable. Built-in.
- **Background refetch on focus** (window/tab focus) ties into the cross-tab session sync (Q3).
- **Query invalidation on mutation**: after `POST /api/backtests` succeeds, invalidate the runs query → list refreshes automatically.
- **Suspense + error boundaries** integrate with React's standard model.
- **DevTools** (dev-only) is invaluable for diagnosing polling/cache issues during implementation.

**Alternatives considered**:
- **SWR** — Smaller surface, simpler API. Doesn't have first-class polling controls; we'd write more glue. Rejected.
- **Rolled-by-hand `useEffect` + `setInterval`** — Bug magnet (stale closures, leaks, no cache). Rejected.
- **TanStack Query subscriptions via Supabase Realtime** — Pushes vs polls. Architecturally cleaner but adds Supabase channel infrastructure + replication slot setup. Out of scope per spec assumption; can land later as an enhancement to the existing query keys.

## 3. Auth surface — `@supabase/supabase-js`

**Decision**: `@supabase/supabase-js@^2.45`. Use the singleton browser client with `persistSession: true` (default). Store tokens in `localStorage` (default).

**Rationale**:
- Official library; first-class support for the exact auth flows we need (`signInWithOtp`, `verifyOtp`, MFA enroll/challenge, `onAuthStateChange`).
- `localStorage` storage is the standard SPA pattern. supabase-js handles refresh automatically; tokens rotate on use.
- `onAuthStateChange` fires across tabs via the storage event — Q3 (cross-tab sign-out) is one event listener.
- Same client is used for direct DB reads via the `from()` API; RLS enforces user-scope automatically.

**Security tradeoff** (XSS): localStorage is readable by injected scripts. We accept this as the standard SPA tradeoff per the cross-feature design ("localStorage JWT via `supabase-js` — standard SPA pattern"). Mitigations: tight CSP in production (Feature 008), no eval / no unsafe-inline, no third-party scripts beyond what's necessary.

**Alternatives considered**:
- **Cookie-based sessions** (httpOnly): more XSS-resistant but requires server-rendered or proxy-managed cookies. Doesn't fit our Vite + Vercel architecture. Rejected per the cross-feature design.
- **Custom OAuth flow** — overkill. Rejected.

## 4. Refresh-token-failure handling (clarification Q5)

**Decision**: Wrap supabase-js's `getSession()` / `refreshSession()` in a retry helper at `frontend/src/auth/refresh-retry.ts`. On failure, retry 3 times with `1s → 2s → 4s` backoff. After exhaustion, force the FR-019 session-expired flow (redirect to `/sign-in?next=<current>`).

**Implementation sketch**:

```typescript
async function withRefreshRetry<T>(op: () => Promise<T>): Promise<T> {
  const backoffs = [1000, 2000, 4000];
  let lastError: unknown = undefined;
  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    try {
      return await op();
    } catch (err) {
      lastError = err;
      if (!isTransientAuthError(err) || attempt === backoffs.length) {
        throw new SessionExpiredError(lastError);
      }
      await new Promise(r => setTimeout(r, backoffs[attempt]));
    }
  }
  throw new SessionExpiredError(lastError);
}
```

Triggered on the `TOKEN_REFRESHED_FAILED` event from supabase-js, OR when an API call returns 401 from FastAPI.

**Rationale**:
- Tolerates network blips during refresh (laptop sleep/wake, transient connectivity).
- Bounded so we never loop forever.
- 7-second total window before forcing session expiry — fast enough that a real revocation surfaces quickly, slow enough that flaky networks don't kick users out.

**Alternatives considered**:
- **Immediate sign-out on first refresh failure (Q5 option B)** — hostile to users with flaky networks. Rejected.
- **Background banner with read-only mode (Q5 option C)** — keeps users in stale state; security risk. Rejected.
- **No explicit handling (Q5 option D)** — accepts supabase-js defaults. Doesn't satisfy SC-006. Rejected.

## 5. Cross-tab sign-out (clarification Q3)

**Decision**: A top-level `onAuthStateChange` listener registered in `frontend/src/auth/AuthProvider.tsx`. When the event is `SIGNED_OUT`, dispatch a route navigation to `/sign-in`. supabase-js fires this event across tabs via the localStorage `storage` event.

**Rationale**: Five lines of code. Closes the multi-tab leak window immediately. Standard pattern.

**Alternatives considered**:
- **BroadcastChannel API** — works for same-origin tabs without supabase-js. Lower-level; reinventing what `onAuthStateChange` already does. Rejected.
- **Service worker** — overkill for sign-out detection. Rejected.

## 6. MFA enrollment + challenge

**Decision**: Use supabase-js's MFA API:
- Enrollment: `supabase.auth.mfa.enroll({ factorType: 'totp' })` → returns a TOTP secret + QR code data URL. Render with `qrcode.react`. User scans, types confirmation code, we call `supabase.auth.mfa.challenge` + `verify`.
- Challenge on sign-in: after `verifyOtp` succeeds, check `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`; if `nextLevel == 'aal2'`, route to `/sign-in/mfa` for the TOTP code.
- Backup codes: surfaced once at enrollment time. User must check an acknowledgement box before completing enrollment (FR-004).

**Rationale**: Native to supabase-js, well-documented, matches Feature 005's TOTP MFA design.

**Alternatives considered**:
- **Custom TOTP implementation** — reinventing. Rejected.
- **Email-based 2FA** — Feature 005's spec explicitly chose TOTP. Rejected.

## 7. Background "active runs" tracker (clarification Q2)

**Decision**: A small client-side store in `frontend/src/lib/active-runs-tracker.ts` backed by Zustand-style state OR a React context — keeping the dep surface tight by using a plain `useSyncExternalStore` hook. Cap: 3 concurrent run UUIDs.

**Behavior**:
- On `POST /api/backtests` success, the new `run_id` is registered in the tracker.
- A top-level `useBackgroundPolling()` hook (mounted in `_authenticated.tsx`) reads the tracker and creates a separate TanStack Query per tracked run, each with `refetchInterval: 1000` while in-flight.
- When a run reaches a terminal state, the tracker removes it AND fires a one-shot toast: "Backtest <id> finished" / "failed".
- If a 4th run is started while 3 are already tracked, the oldest is evicted (still runs in the backend; UI just doesn't background-poll it).

**Rationale**:
- 3-run cap prevents runaway polling.
- Tracker is in-memory only — refreshing the page resets it; the user can re-establish tracking by visiting `/runs`.
- No new state-management library required; React 18's `useSyncExternalStore` is enough.

**Alternatives considered**:
- **Zustand / Jotai** — small libraries that do exactly this. Pulled in over `useSyncExternalStore` if the team prefers; either works. Defer to plan-phase preference.
- **Service worker periodic sync** — overkill, not supported on all browsers, sleeps between syncs.

## 8. Adaptive polling cadence (clarification Q1)

**Decision**: TanStack Query's `refetchInterval` accepts a function `(query) => number | false`. We use:

```typescript
function adaptivePollingInterval(query) {
  const status = query.state.data?.status;
  if (status === 'queued' || status === 'running') return 1000;
  if (status === 'finished' || status === 'failed') return 30000;
  return false;
}
```

Applied to the per-run status query in `useRunStatus` and the data-download status query.

For the runs LIST (no per-row status fetch), we use a static `refetchInterval: 5000` — fast enough that newly-started runs appear quickly, slow enough not to hammer the backend on browse pages.

**Rationale**: Q1's "adaptive 1s/30s" maps directly to this function. The runs-list 5s default is a separate pragmatic choice — list refreshes are cheap (single paginated query) and 5s is the responsiveness sweet spot.

**Alternatives considered**:
- **Hardcoded 1s everywhere** — too noisy for completed runs.
- **Manual refetch button** — no live updates; bad UX.

## 9. FastAPI fetch wrapper

**Decision**: A thin typed wrapper at `frontend/src/api/client.ts` that:
1. Reads the current session via `supabase.auth.getSession()` and attaches `Authorization: Bearer <access_token>`.
2. Resolves the base URL from `import.meta.env.VITE_API_BASE_URL` (defaults to `http://localhost:8001` in dev).
3. Maps documented error responses (401 / 404 / 422 / 429 / 503) to typed error classes that hooks/components catch.
4. Auto-triggers the refresh-retry helper (research §4) on 401.

Then per-resource typed modules (`runs.ts`, `backtests.ts`, etc.) call this wrapper with hardcoded paths + Zod-validated response bodies.

**Rationale**:
- Single place to add the Authorization header — eliminates "forgot to auth" bugs.
- Single place for error mapping → consistent UX.
- Zod validation at the boundary catches API drift early.

**Alternatives considered**:
- **`ky` / `axios`** — heavier deps for a small surface. Native `fetch` + a 50-line wrapper is enough.
- **OpenAPI codegen** — would be ideal long-term; needs a Feature 006 OpenAPI spec. Defer.

## 10. supabase-js direct reads vs FastAPI

**Decision**: All READS go through FastAPI (the Feature 006 endpoints). All MUTATIONS go through FastAPI.

The spec ALLOWED supabase-js direct reads for runs/trades/signals/journal — RLS would scope them automatically. But going through FastAPI:
- Centralizes pagination logic (cursor format already implemented in Feature 006)
- Centralizes journal-event emission (every read can be audited if we later choose)
- Single contract surface — the contracts in Feature 006 are authoritative

We use `supabase-js` ONLY for auth (sign-in, sign-out, MFA, refresh, session). No direct DB queries from the browser.

**Rationale**:
- Simpler mental model: "the UI talks to FastAPI for data; Supabase only for auth."
- Avoids the dual-protocol skew where some reads work but others fail differently.
- The pagination cursors from Feature 006 (opaque tokens) are already designed for this exact use.

**Alternatives considered**:
- **Hybrid (supabase-js reads, FastAPI writes)** — performant but doubles the surface to test/maintain. Rejected for simplicity.
- **All supabase-js (skip FastAPI for reads)** — viable but means the UI re-implements the cursor / journal-event audit / etc. that Feature 006 already does. Rejected.

## 11. Auto-seed default config on first sign-in (clarification Q4)

**Decision**: Implement as a Supabase Postgres trigger on `auth.users` AFTER INSERT. New migration `backend/db/migrations/0070_seed_default_config_on_signup.sql` defines a function `seed_default_config_for_user(uid uuid)` and a trigger that calls it.

**Implementation sketch**:

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

CREATE OR REPLACE TRIGGER on_auth_user_created_seed_config
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.seed_default_config_for_user(NEW.id);
```

**Rationale**:
- Zero UI complexity — every authenticated user has at least one config the moment they're created.
- Idempotent: `ON CONFLICT DO NOTHING` makes re-seeding safe.
- Backend-only change; UI doesn't need a "first sign-in" branch.

**Alternatives considered**:
- **UI-side seeding on first navigate** (Q4 option B) — needs a new POST endpoint + first-load detection logic. More moving parts.
- **No seeding; show empty state** (Q4 option A/D) — out per Q4.

## 12. Existing Feature 003/004 test compatibility

**Decision**: Inventory existing `frontend/src/**/*.test.tsx` files. For each:
- If the test exercises a component that's still in the UI → keep, port as needed for the new router/query shape.
- If the test exercises a component that's removed (the static-server data path) → retire with a documented replacement.

Per SC-007, no test left in an "unknown state".

The existing tests cover (from earlier conversation): `preset-picker`, `risk-knobs`, `run-actions`, `topbar`, plus new uncommitted `configure-run-menu` + `confirm-dialog`. The deleted ones (`preset-picker`, `risk-knobs`) were already removed in pre-feature work; this feature finalizes that removal and retires their tests.

**Rationale**: Constitution IV says tests for every behavior change. SC-007 codifies that no test is silently broken.

## 13. CSS / design system

**Decision**: Reuse the existing shadcn/ui + Tailwind setup from Feature 004 unchanged. The new components (SignInForm, MfaEnrollment, etc.) compose from existing primitives.

**Rationale**: No design rework for Feature 007. Maintains visual continuity.

## 14. Test strategy: msw for HTTP mocking

**Decision**: Add `msw@^2.x` for mocking the FastAPI fetch + supabase-js HTTP calls in Vitest unit tests. Set up handlers in `frontend/src/__tests__/msw-server.ts`.

**Rationale**:
- Mocks at the HTTP boundary (most realistic).
- Same handlers work across all tests; less per-test setup.
- supabase-js makes real HTTP requests under the hood; msw catches them.

**Alternatives considered**:
- **`vi.mock` per call** — works but creates many ad-hoc mocks. Brittle.
- **Real supabase-js + a local Supabase** — too heavy for unit tests; that's what integration tests are for.

## 15. Test strategy: integration tests via TestClient against local Supabase

**Decision**: A small `frontend/src/__tests__/integration/` directory holds tests that run the full app against the local Supabase from Feature 005's `tests/storage/conftest.py`. These are opt-in via an env var (`FRONTEND_INTEGRATION=1`).

**Rationale**:
- Verifies the auth flow against real Supabase Auth + RLS.
- Mirrors the backend's pattern from Feature 006.
- Heavy enough to be opt-in; light enough to ship with the feature.

---

## Summary

Every spec-level decision and plan-level unknown is resolved. The 15 chosen technologies + patterns are:

1. `@tanstack/react-router@^1.x` — type-safe file-based routing
2. `@tanstack/react-query@^5.x` — data fetching, cache, polling, mutations
3. `@supabase/supabase-js@^2.45` — auth only (sign-in, MFA, refresh, cross-tab)
4. `frontend/src/auth/refresh-retry.ts` — 3-retry exponential backoff for Q5
5. `onAuthStateChange` listener in `AuthProvider` — Q3 cross-tab sign-out
6. supabase-js MFA API + `qrcode.react` — TOTP enrollment + challenge
7. `frontend/src/lib/active-runs-tracker.ts` via `useSyncExternalStore` — Q2 background polling, cap 3
8. TanStack Query `refetchInterval` function — Q1 adaptive 1s/30s
9. `frontend/src/api/client.ts` — thin typed fetch wrapper with auth + error mapping
10. FastAPI for all data (no supabase-js direct DB reads)
11. Postgres trigger `seed_default_config_for_user` — Q4 auto-seed
12. Existing test inventory: keep / port / retire (SC-007)
13. shadcn/ui + Tailwind reused unchanged
14. `msw@^2.x` for unit-test HTTP mocking
15. Frontend integration tests opt-in via `FRONTEND_INTEGRATION=1`

One new backend migration (`0070_seed_default_config_on_signup.sql`). No constitutional amendment required.

No NEEDS CLARIFICATION markers remain. Ready for Phase 1.
