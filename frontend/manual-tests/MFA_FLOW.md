# MFA flow runbook — Feature 007

End-to-end manual verification of email OTP + TOTP MFA enrollment +
challenge against the live Supabase project. Mirrors Feature 005's
runbook style. Run this once before tagging Feature 007 as shipped, and
again when any change touches `frontend/src/auth/**` or
`frontend/src/routes/sign-in/**`.

## Prerequisites

1. `frontend/.env.local` populated with:
   - `VITE_SUPABASE_URL` — live project URL
   - `VITE_SUPABASE_ANON_KEY` — publishable key (NOT service-role)
   - `VITE_API_BASE_URL=http://localhost:8001`
2. Backend running: `make api-dev` (port 8001).
3. Frontend dev server: `make ui-dev` (port 5173).
4. A working email inbox you can read from.
5. A TOTP authenticator app installed (Google Authenticator, 1Password, etc.).
6. The migration `backend/db/migrations/0070_seed_default_config_on_signup.sql`
   already applied to the live Supabase project (see
   [specs/007-frontend-auth-api-migration/quickstart.md](../../specs/007-frontend-auth-api-migration/quickstart.md)).

## Step 1 — Cold start, fresh user

1. Open a clean browser profile (Incognito / private window) at
   `http://localhost:5173/`.
2. **Expected**: immediate redirect to `/sign-in?next=%2F`.
3. **Verify**: the topbar is NOT visible yet (no `data-testid="authenticated-topbar"`).

## Step 2 — Email OTP send

1. In the email field, enter a NEW address (one that has never signed in
   before).
2. Click **Send sign-in code**.
3. **Expected**: stage advances to the OTP entry screen ("Check your inbox
   at <email>").
4. **Verify** (DB side, via Supabase dashboard): a row appears in
   `auth.users` for that email.
5. **Verify** (Feature 007 trigger / SC-001 + FR-021): a row appears in
   `public.configs` with `user_id` matching the new `auth.users.id` and
   `name='default'`. This is the auto-seed trigger doing its job.

## Step 3 — Email OTP verify

1. Open the inbox. Copy the 6-digit code.
2. Paste it into the OTP field. Whitespace should auto-strip; the field
   caps at 6 characters.
3. Click **Verify code**.
4. **Expected**: redirect to `/mfa-enroll` (first sign-in => no factor =>
   forced enrollment).

## Step 4 — MFA enrollment

1. **Verify**: page shows a QR code, the plaintext secret string, and an
   "I've saved my backup codes" checkbox.
2. Scan the QR code in your authenticator app.
3. The checkbox MUST be ticked AND a 6-digit code MUST be entered before
   the **Confirm enrollment** button enables. Test both gates separately.
4. Enter the current 6-digit code from your app; click **Confirm
   enrollment**.
5. **Expected**: redirect to `/runs`.
6. **Verify**: topbar is now visible with:
   - Connection status (green dot if backend healthy)
   - Sign-out menu showing the user's email
   - Theme toggle

## Step 5 — Sign-out

1. Click the user-email menu, click **Sign out**.
2. **Expected**: redirect to `/sign-in`.
3. **Verify**: visiting `http://localhost:5173/runs` again immediately
   redirects to `/sign-in?next=%2Fruns`.

## Step 6 — Returning sign-in (with MFA)

1. From the sign-in page, enter the SAME email from Step 2.
2. Click **Send sign-in code**, copy from inbox, enter, click **Verify**.
3. **Expected**: redirect to `/sign-in/mfa` (factor enrolled => aal1 =>
   challenge).
4. Enter a CURRENT 6-digit code from your authenticator. Click
   **Verify**.
5. **Expected**: redirect to `/runs`. Topbar visible.

## Step 7 — Wrong MFA code

1. Sign out. Repeat steps 6.1 and 6.2.
2. On `/sign-in/mfa`, enter `000000` (definitely wrong).
3. **Expected**: an error message appears inline. No navigation away.
4. Enter the correct current code. **Expected**: redirect to `/runs`.

## Step 8 — Backup-code path

1. Sign out. Repeat steps 6.1 and 6.2.
2. On `/sign-in/mfa`, click **Use a backup code**. Confirm the input mode
   switches (placeholder reads "Backup code").
3. Enter a backup code (if you saved them in Step 4) or any 8+ character
   string to confirm the wrong-code error path renders properly.
4. **Expected**: success navigates to `/runs`; failure renders an inline
   error.

## Step 9 — Cross-tab sign-out (FR-020)

1. With a signed-in session in Tab A, open the same app in Tab B (same
   browser profile). Both tabs should load `/runs` without re-prompting.
2. In Tab A, click **Sign out**.
3. **Expected**: Tab B navigates to `/sign-in` within a heartbeat (~1s).
   Polling/click-anywhere should be unnecessary — the
   `onAuthStateChange` SIGNED_OUT event drives it.

## Step 10 — Connection-status indicator (SC-005)

1. With the app open at `/runs`, stop the backend: `make api-stop` or
   `Ctrl-C` in the `make api-dev` terminal.
2. **Expected**: within 5 seconds, the topbar dot turns red and reads
   "API unreachable".
3. Restart the backend: `make api-dev`.
4. **Expected**: within 10 seconds (the next polling cycle), the dot
   turns green and reads "API connected".

## Sign-off

When all 10 steps pass on a fresh database + fresh user, MFA flow is
verified end-to-end. Record the date below.

| Date | Reviewer | Notes |
|---|---|---|
| | | |

## Failure modes & where to look

- **OTP never arrives**: Supabase project's email rate-limit. Check the
  Auth → Email Templates → Logs section. Use a Resend-backed sender if
  you're hitting the default rate cap.
- **Redirected to `/mfa-enroll` even though I enrolled**: the
  `auth.mfa.listFactors()` call may be returning stale data. Hard-reload
  the page; verify in Supabase dashboard the factor is `verified=true`.
- **Connection-status dot stays red despite backend running**: confirm
  the FastAPI `/healthz` route is reachable at `VITE_API_BASE_URL` from
  the browser (CORS or proxy issues will show up in DevTools network
  tab).
- **Default config not created on new user**: the SECURITY DEFINER
  trigger `seed_default_config_for_user` must own the configs table.
  Check `\df+ seed_default_config_for_user` for the owner column.
