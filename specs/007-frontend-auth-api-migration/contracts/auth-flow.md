# Contract: Authentication Flow

State machine for sign-in / MFA / sign-out / refresh. Authoritative for `frontend/src/auth/*` and tests.

## States

```
                       (no session)
                            │
                            │  user submits email on /sign-in
                            ▼
                    (otp_requested)
                            │
                            │  user submits OTP code
                            ▼
              ┌──────────────────────────┐
              │   call verifyOtp(...)    │
              └────────────┬─────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       (success +    (success +    (failure)
       no factor    factor                
       enrolled)     enrolled)       
              │            │            │
              ▼            ▼            ▼
       /mfa-enroll   /sign-in/mfa   error: "wrong code" / rate-limited
              │            │
              │            │  user submits TOTP code
              │            ▼
              │   ┌──────────────────────┐
              │   │ supabase.auth.mfa.   │
              │   │   challenge + verify │
              │   └─────────┬────────────┘
              │             │
              │       (success / fail)
              │             │
              │             ▼
              │       (authenticated, aal2)
              ▼             │
     /mfa-enroll page       │
     (QR + backup codes)    │
              │             │
              │  user scans, confirms, acks backup codes
              ▼             │
       (authenticated, aal2)│
              │             │
              └─────────────┘
                            │
                            │  sign-out triggered in this tab OR another
                            ▼
                       (no session)
```

## API surface (`frontend/src/auth/AuthProvider.tsx`)

```typescript
type AuthContext = {
  session: Session | null
  user: User | null
  isLoading: boolean

  signInWithOtp(email: string): Promise<{ sent: true }>
  verifyOtp(email: string, token: string): Promise<{ requiresMfa: boolean; firstSignIn: boolean }>
  enrollMfa(): Promise<{ qrCodeUrl: string; secret: string; backupCodes: string[] }>
  confirmMfaEnrollment(code: string): Promise<void>
  challengeMfa(code: string): Promise<void>
  useBackupCode(code: string): Promise<void>
  signOut(): Promise<void>
}
```

## Concrete sequence — happy path (returning user with MFA)

1. User visits `/runs` while signed out.
2. `_authenticated.tsx` beforeLoad → redirect to `/sign-in?next=/runs`.
3. User enters email, clicks Sign In.
4. UI calls `signInWithOtp(email)` → supabase-js POST `/auth/v1/otp` → email sent.
5. UI advances to "Enter code from your email" prompt (same `/sign-in` route, internal state).
6. User enters 6-digit code, clicks Verify.
7. UI calls `verifyOtp(email, token)` → supabase-js POST `/auth/v1/verify` → session created at `aal1`.
8. `verifyOtp` checks `mfa.getAuthenticatorAssuranceLevel()`:
   - `nextLevel='aal2'`, `currentLevel='aal1'` → user has a factor; route to `/sign-in/mfa?next=/runs`.
9. User enters TOTP code from their authenticator app.
10. UI calls `challengeMfa(code)` → supabase-js `mfa.challenge` + `verify`.
11. Session upgrades to `aal2`. UI navigates to `?next` (`/runs`).
12. `_authenticated.tsx` beforeLoad re-runs, session valid + aal2 → loads.

## Concrete sequence — first-time user

After step 7 above:
- `mfa.getAuthenticatorAssuranceLevel()` → `nextLevel=null`, `currentLevel='aal1'` (no factor enrolled).
- UI redirects to `/mfa-enroll`.
- User calls `enrollMfa()` → backend returns `qrCodeUrl`, `secret`, `backupCodes[]`.
- UI renders QR + plaintext secret (for typing) + backup-codes list.
- User scans with authenticator, types the 6-digit code that appears.
- UI calls `confirmMfaEnrollment(code)`. On success, factor is now enrolled and verified for this session (aal2).
- UI requires user to check "I've saved my backup codes" checkbox.
- UI navigates to `?next` or `/runs`.

## Sign-out sequence

1. User clicks Sign Out in topbar menu (any tab).
2. UI calls `signOut()` → supabase-js POST `/auth/v1/logout` → clears localStorage.
3. `onAuthStateChange` fires `SIGNED_OUT` event LOCALLY.
4. The localStorage write also fires a `storage` event in every OTHER tab.
5. Every tab's `AuthProvider` listener receives `SIGNED_OUT`, dispatches a navigation to `/sign-in`.
6. All tabs land on `/sign-in` within milliseconds (clarification Q3 / FR-020).

## Refresh-token-failure sequence (FR-019 + Q5)

The default supabase-js client auto-refreshes the access token in the background. If the refresh request fails:

1. supabase-js emits `TOKEN_REFRESHED_FAILED` event (or the equivalent — depending on the version, it's `SIGNED_OUT` if the refresh is treated as session-end).
2. `frontend/src/auth/refresh-retry.ts` intercepts:
   - Attempt 1: wait 1 s, call `refreshSession()`.
   - Attempt 2: wait 2 s, retry.
   - Attempt 3: wait 4 s, retry.
   - If still failing: emit `SessionExpiredError` → router redirects to `/sign-in?next=<current>`.
3. Until step 3 fires, the UI continues to show the last-loaded data (no "snap to sign-in" UX disruption for a 2-second blip).

A 401 from any FastAPI call ALSO triggers this same retry loop (the `api/client.ts` wrapper). If the retry succeeds, the original request is retried once with the fresh token; if it fails after the retry exhaustion, the user is routed to sign-in.

## Cross-tab sync (Q3 / FR-020)

```typescript
// In AuthProvider, mounted once at the root
useEffect(() => {
  const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      router.navigate({ to: '/sign-in' })
    } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      setSession(session)
    }
  })
  return () => subscription.unsubscribe()
}, [])
```

`onAuthStateChange` is documented to fire across tabs because supabase-js uses localStorage as the auth store, and localStorage mutations fire the browser's `storage` event in other tabs of the same origin.

## Test obligations

| Test | Expected |
|---|---|
| `signInWithOtp(email)` → email accepted, `verifyOtp` advances to MFA route | Vitest + mocked supabase-js |
| `verifyOtp(wrong_code)` → error surfaced inline; user can retry | Vitest |
| First-time user (no factor) → routed to `/mfa-enroll` | Vitest with mocked aal=`{nextLevel: null, currentLevel: 'aal1'}` |
| Returning user with factor → routed to `/sign-in/mfa` | Vitest with mocked aal=`{nextLevel: 'aal2', currentLevel: 'aal1'}` |
| MFA challenge wrong code → error inline, retry available | Vitest |
| MFA challenge with backup code → consumes the code, success | Vitest |
| Sign-out in tab A → tab B redirects to `/sign-in` | Vitest with simulated `storage` event |
| Access-token refresh fails 2x then succeeds → no user impact | Vitest with mocked supabase-js HTTP |
| Access-token refresh fails 3 times → routed to `/sign-in?next=<current>` | Vitest |
| 401 from FastAPI → refresh-retry runs → success retries the original request | Vitest with msw |

## Security obligations

- Service-role JWTs MUST never reach the frontend. Vite env vars: only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the publishable one). The service-role secret stays on the FastAPI side.
- Token storage: localStorage (supabase-js default). Documented XSS tradeoff in research.md §3.
- The MFA enrollment QR + secret MUST be shown ONLY ONCE; after that the user has to disable + re-enroll.
- Backup codes MUST be displayed only at enrollment + after a backup-code-recovery. Never on subsequent screens.
