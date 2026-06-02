# Auth: Single-Factor Email 8-Digit Code — Design

**Date**: 2026-06-01
**Status**: Approved — implementation via direct TDD off this doc
**Topic**: Replace email-OTP + TOTP-MFA sign-in with a single-factor emailed 8-digit code.

---

## 1. Motivation

The current sign-in is two-factor: a 6-digit email OTP (assurance level `aal1`)
followed by a mandatory TOTP authenticator step to reach `aal2`. The product
direction is to drop the authenticator entirely and use a single emailed
**8-digit** code as the whole sign-in.

This **reverses a previously-documented decision**. The cross-feature migration
design ([docs/migrations/2026-05-30-supabase-vercel-migration.md](../../migrations/2026-05-30-supabase-vercel-migration.md)
§4 and §9) chose "email OTP + TOTP MFA" explicitly for stronger auth on a
financial-research app. This doc records the reversal so it is not
re-litigated: the user has chosen single-factor email codes, accepting the
reduced account-security posture.

## 2. Goals / Non-goals

**Goals**
- Sign-in = enter email → receive 8-digit code by email → enter code → in.
- No authenticator enrollment, no MFA challenge, no `aal2` gate.
- 8-digit code length (Supabase email OTP supports 6–10).
- Preserve constitutional invariants: TDD (IV) and educational `HelpTooltip`s (VI).

**Non-goals**
- Restricting self-signup (`shouldCreateUser: true` stays — see §6).
- Backend changes (none needed — see §5).
- Migrating/deleting existing users.

## 3. Frontend changes (`frontend/src/`)

**Delete (TOTP-only):**
- `components/auth/MfaEnrollment.tsx` + `MfaEnrollment.test.tsx`
- `components/auth/MfaChallenge.tsx` + `MfaChallenge.test.tsx`
- `routes/_authenticated.mfa-enroll.tsx`
- `routes/sign-in/mfa.tsx`
- `qrcode.react` dependency (only `MfaEnrollment` consumes it)

**Edit:**
- `auth/AuthProvider.tsx` — remove `enrollMfa`, `confirmMfaEnrollment`,
  `challengeMfa`, `getMfaState`, the `EnrollMfaResult` type, and the
  `requiresMfa` computation in `verifyOtp`. `verifyOtp(email, token)` verifies
  and resolves (no MFA branch).
- `routes/_authenticated.tsx` — guard checks only that a `session` exists.
  Remove `getAuthenticatorAssuranceLevel` / `listFactors` calls and the
  enroll/challenge redirect branches.
- `components/auth/OtpCodeForm.tsx` — require 8 digits (`code.length < 8`);
  update placeholder + copy "6-digit" → "8-digit". (Input already caps at 8.)
- `components/help-content.ts` — remove the **MFA** `HelpTooltip` entry; update
  the sign-in-code tooltip to say 8-digit (principle VI).
- Any sign-in page that branches on `verifyOtp().requiresMfa` — drop that branch
  and navigate straight to the post-login destination.

## 4. Supabase config

- `backend/supabase/config.toml`: `[auth.email] otp_length` `6` → `8`; keep
  `[auth.mfa.totp] enroll_enabled = false` (already false) for local parity.
- **Production project** (`qkrfydcfeqrchhrjltlh`): set email OTP length to **8**
  and disable TOTP enrollment via the Supabase **Management API** (targeted
  PATCH of auth config), *not* `supabase config push` (which would overwrite all
  remote auth settings). Applied/confirmed by the operator.

## 5. Backend — no change

`backend/src/intraday_trade_spy/auth/token.py` verifies only the JWT audience
(`aud == "authenticated"`); it does not check assurance level. An `aal1`
session's JWT is fully valid, so the API needs no change.

## 6. Existing factors & security notes

- **Existing enrolled TOTP factors** become inert once the guard's AAL checks
  are removed. Decision: **leave them** (no auth-data mutation). Optional
  cleanup (unenroll) can be done later if desired.
- **Reduced security**: removing the second factor lowers account security on a
  financial app. Recorded as an accepted tradeoff.
- **Open signup**: `signInWithOtp({ shouldCreateUser: true })` means anyone who
  can receive email at any address can create an account. With MFA gone this is
  the only access gate. Out of scope here; flagged as a possible follow-up
  (allowlist / invite-only) if access needs restricting.

## 7. Testing (TDD — constitution principle IV)

- `OtpCodeForm.test.tsx`: accepts 8 digits; rejects <8; paste-normalization caps
  at 8; copy says "8-digit".
- `AuthProvider.test.tsx`: `verifyOtp` resolves without `requiresMfa`; MFA
  methods no longer on the context value.
- Delete `MfaEnrollment.test.tsx` / `MfaChallenge.test.tsx`.
- Route-guard coverage: a signed-in (`aal1`) session reaches the app with no MFA
  redirect; an unauthenticated request redirects to `/sign-in`.

## 8. Decisions recorded

| Decision | Choice |
|---|---|
| MFA scope | Remove TOTP completely (single factor) |
| Code length | 8 digits |
| Existing enrolled factors | Leave (inert); optional cleanup later |
| Backend | No change |
| Process | Direct TDD off this design doc |
| Self-signup | Unchanged (open); flagged as follow-up |
