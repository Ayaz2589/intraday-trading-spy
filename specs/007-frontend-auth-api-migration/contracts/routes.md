# Contract: Route Tree

Every route's path, public-vs-protected status, params, search params, and guard behavior. Authoritative for `frontend/src/routes/*.tsx` and the auth-guard tests.

## Public routes (no auth required)

| Path | File | Purpose |
|---|---|---|
| `/sign-in` | `routes/sign-in/index.tsx` | Email entry → OTP entry on the same page (state-driven within the route). |
| `/sign-in/callback` | `routes/sign-in/callback.tsx` | Handles the magic-link redirect. Parses `#access_token=...` from the URL fragment; persists via `supabase.auth.setSession`; redirects to `/` or `?next=`. |
| `/sign-in/mfa` | `routes/sign-in/mfa.tsx` | TOTP challenge during sign-in. Reached after `verifyOtp` returns `requiresMfa: true`. Has a "use backup code" link. |

## Protected routes (require valid session via `_authenticated.tsx` layout)

| Path | File | Params | Search Params |
|---|---|---|---|
| `/` | `routes/index.tsx` | none | none — redirects to `/runs` |
| `/runs` | `routes/_authenticated.runs.tsx` | none | `cursor?: string` (TanStack Query cursor, base64) |
| `/runs/$runId` | `routes/_authenticated.runs.$runId.tsx` | `runId: UUID` | `tab?: 'summary' \| 'trades' \| 'signals' \| 'journal'` (default `summary`) |
| `/strategies` | `routes/_authenticated.strategies.tsx` | none | none |
| `/data` | `routes/_authenticated.data.tsx` | none | `cursor?: string` |
| `/mfa-enroll` | `routes/_authenticated.mfa-enroll.tsx` | none | none — reached when user has no enrolled factor |

## Guard behavior

The `_authenticated.tsx` layout's `beforeLoad`:

```typescript
beforeLoad: async ({ location }) => {
  const session = useAuthStore.getState().session
  if (!session) {
    throw redirect({
      to: '/sign-in',
      search: { next: location.href },
    })
  }
  const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal.nextLevel === 'aal2' && aal.currentLevel === 'aal1') {
    throw redirect({ to: '/sign-in/mfa', search: { next: location.href } })
  }
  if (aal.nextLevel === null && aal.currentLevel === 'aal1') {
    // No factor enrolled; force enrollment
    throw redirect({ to: '/mfa-enroll' })
  }
}
```

## Deep-link preservation (FR-018, FR-019)

Every redirect to `/sign-in` includes `?next=<original-path>`. After successful sign-in (and MFA if required), `routes/sign-in/index.tsx`'s success handler navigates to `next` (default `/runs`). Tested explicitly:

- `GET /runs/abc123` while signed out → redirected to `/sign-in?next=/runs/abc123` → after sign-in → land on `/runs/abc123`.
- `GET /runs/abc123` while signed in but no MFA → redirected to `/mfa-enroll` → after enrollment → land on `/runs/abc123`.

## Test obligations (per route)

- **`/sign-in`** — email field validation, OTP code field validation, error display (rate limit, wrong code), success → MFA check → next route.
- **`/sign-in/callback`** — parses URL fragment correctly, calls `setSession`, redirects to `?next` or `/`. Tested with mocked supabase-js.
- **`/sign-in/mfa`** — TOTP entry, backup-code fallback, success → next route, failure → error display.
- **`_authenticated.*`** — every protected route's `beforeLoad` redirects unauth → `/sign-in?next=<own-path>`.
- **`/mfa-enroll`** — QR display, backup-code acknowledge checkbox required, confirm code valid → return to `next`.
- **`/runs`** — list rendering with cursor, "Start Backtest" button visible, infinite/page-stepping pagination.
- **`/runs/$runId`** — tabs render correct hooks, deep-link to a wrong-user run returns 404 view (FR-018).
- **`/strategies`** — list reflects current registry, HelpTooltips present per `contracts/help-tooltips.md`.
- **`/data`** — list + new-download form.

## Error pages

| State | UI |
|---|---|
| Route not found | `<NotFoundView>` — generic "page not found" with a link back to `/` |
| 404 from API on protected resource (cross-user attempt) | Inline "this resource doesn't exist" view; routes back to list |
| 401 from API | Triggers refresh-retry; on exhaustion redirects to `/sign-in?next=<current>` |
| 5xx / network error | Toast "Service unavailable. Retrying…" with connection-status indicator turning red |
