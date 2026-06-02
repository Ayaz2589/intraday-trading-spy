# Auth: Single-Factor Email 8-Digit Code — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the email-OTP + TOTP-MFA sign-in with a single-factor emailed 8-digit code.

**Architecture:** Frontend-only code change plus Supabase auth config. Delete all TOTP UI/logic, strip MFA methods from `AuthProvider`, simplify the route guard to a session check, widen the OTP form to 8 digits, and set the Supabase email-OTP length to 8. Backend is unchanged (JWT verification checks audience only, never assurance level).

**Tech Stack:** React 19 + TypeScript + Vite + TanStack Router, Vitest, Supabase JS, Supabase CLI/Management API.

**Design:** [docs/superpowers/specs/2026-06-01-auth-email-8digit-code-design.md](../specs/2026-06-01-auth-email-8digit-code-design.md)

**Conventions:** Run all `npm`/`npx` commands from `frontend/`. Tests: `npx vitest run <path>`. Commit after each task. Constitution principle IV (TDD) governs every code change; generated (`routeTree.gen.ts`) and config (`config.toml`, `package.json`) edits are TDD-exempt.

---

### Task 1: Widen OtpCodeForm to 8 digits

**Files:**
- Test: `frontend/src/components/auth/OtpCodeForm.test.tsx`
- Modify: `frontend/src/components/auth/OtpCodeForm.tsx`

- [ ] **Step 1: Update the failing tests** — replace the three 6-digit assertions:

```tsx
  it('disables submit until 8 digits are entered', async () => {
    const onSubmit = vi.fn()
    const { OtpCodeForm } = await import('./OtpCodeForm')
    render(<OtpCodeForm email="jane@example.com" onSubmit={onSubmit} />)
    const button = screen.getByRole('button', { name: /Verify code/i })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Sign-in code'), { target: { value: '1234567' } })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Sign-in code'), { target: { value: '12345678' } })
    expect(button).not.toBeDisabled()
  })

  it('strips whitespace on paste', async () => {
    const { OtpCodeForm } = await import('./OtpCodeForm')
    render(<OtpCodeForm email="jane@example.com" onSubmit={() => {}} />)
    const input = screen.getByLabelText('Sign-in code') as HTMLInputElement
    fireEvent.change(input, { target: { value: '12 34 56 78' } })
    expect(input.value).toBe('12345678')
  })
```

And update the onSubmit test to an 8-digit code:

```tsx
    fireEvent.change(screen.getByLabelText('Sign-in code'), { target: { value: '65432187' } })
    fireEvent.submit(screen.getByTestId('otp-code-form'))
    expect(onSubmit).toHaveBeenCalledWith('65432187')
```

(Keep the "caps input at 8 characters" test as-is — it already expects `12345678`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/auth/OtpCodeForm.test.tsx`
Expected: FAIL (submit still enabled at 7→8 boundary uses old `< 6`).

- [ ] **Step 3: Implement** — in `OtpCodeForm.tsx`, change the two `< 6` checks to `< 8` and update copy:

```tsx
    if (code.length < 8) return
```
```tsx
      <p className="text-sm text-muted-foreground mb-4">
        Check your inbox at <strong>{email}</strong> for an 8-digit code.
      </p>
```
```tsx
        placeholder="8-digit code"
```
```tsx
        disabled={code.length < 8 || pending}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/auth/OtpCodeForm.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/auth/OtpCodeForm.tsx frontend/src/components/auth/OtpCodeForm.test.tsx
git commit -m "feat(auth): require 8-digit email sign-in code"
```

---

### Task 2: Strip MFA from AuthProvider + sign-in page

**Files:**
- Modify: `frontend/src/auth/AuthProvider.test.tsx`
- Modify: `frontend/src/auth/AuthProvider.tsx`
- Modify: `frontend/src/routes/sign-in/index.tsx`

- [ ] **Step 1: Update the test mock** — in `AuthProvider.test.tsx`, delete the `mfa: { ... }` block from `mockSupabase.auth` (lines with `enroll/challenge/verify/getAuthenticatorAssuranceLevel/listFactors`). The two existing tests (`loads then settles`, `throws outside provider`) stay unchanged.

- [ ] **Step 2: Run to verify it still passes pre-impl (mock no longer needs mfa)**

Run: `npx vitest run src/auth/AuthProvider.test.tsx`
Expected: PASS (mock change alone is safe).

- [ ] **Step 3: Implement AuthProvider** — remove the `EnrollMfaResult` type; remove `enrollMfa`, `confirmMfaEnrollment`, `challengeMfa`, `getMfaState` from both the `AuthContextValue` interface and the `value` object; simplify `verifyOtp`:

```tsx
  verifyOtp(email: string, token: string): Promise<void>
```
```tsx
    async verifyOtp(email, token) {
      const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
      if (error) throw error
    },
```

- [ ] **Step 4: Implement sign-in page** — in `routes/sign-in/index.tsx`, replace the `submitCode` MFA branch:

```tsx
  const submitCode = async (code: string) => {
    setBusy(true)
    setError(null)
    try {
      await auth.verifyOtp(email, code)
      navigate({ to: next ?? '/runs' })
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setBusy(false)
    }
  }
```

- [ ] **Step 5: Run AuthProvider tests + typecheck**

Run: `npx vitest run src/auth/AuthProvider.test.tsx && npx tsc --noEmit -p tsconfig.app.json 2>&1 | head`
Expected: tests PASS. Typecheck may still error on the not-yet-deleted MFA route/component files (Task 3) — that's fine, those go away next.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/auth/AuthProvider.tsx frontend/src/auth/AuthProvider.test.tsx frontend/src/routes/sign-in/index.tsx
git commit -m "feat(auth): drop MFA methods from AuthProvider; sign-in goes straight to app"
```

---

### Task 3: Simplify the route guard to a session check

**Files:**
- Modify: `frontend/src/routes/_authenticated.tsx`

- [ ] **Step 1: Implement** — replace `getAuthState` + `beforeLoad` so it only checks for a session:

```tsx
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const supabase = getSupabase()
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      throw redirect({ to: '/sign-in', search: { next: location.href } })
    }
  },
  component: AuthenticatedLayout,
})
```

Delete the now-unused `getAuthState` function. Leave `AuthenticatedLayout` untouched.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | head`
Expected: remaining errors only reference the MFA files deleted in Task 4.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/_authenticated.tsx
git commit -m "feat(auth): guard on session only, remove AAL/MFA redirects"
```

---

### Task 4: Delete TOTP components, routes, help entries, and dependency

**Files:**
- Delete: `frontend/src/components/auth/MfaEnrollment.tsx`, `MfaEnrollment.test.tsx`, `MfaChallenge.tsx`, `MfaChallenge.test.tsx`
- Delete: `frontend/src/routes/_authenticated.mfa-enroll.tsx`, `frontend/src/routes/sign-in/mfa.tsx`
- Modify: `frontend/src/components/help-content.ts`
- Modify: `frontend/src/components/help-tooltip.feature-007-coverage.test.tsx`
- Modify: `frontend/package.json` (remove `qrcode.react`)

- [ ] **Step 1: Confirm no stray references** before deleting:

Run: `cd frontend && grep -rln "MfaChallenge\|MfaEnrollment\|qrcode.react\|helpKey=\"mfa\"\|helpKey=\"totp\"\|helpKey=\"backup_codes\"\|'mfa'\|'totp'\|'backup_codes'" src | grep -v node_modules`
Expected: only the files listed in this task (plus the coverage test). If anything else appears, handle it before deleting.

- [ ] **Step 2: Delete the files**

```bash
cd frontend
git rm src/components/auth/MfaEnrollment.tsx src/components/auth/MfaEnrollment.test.tsx \
       src/components/auth/MfaChallenge.tsx src/components/auth/MfaChallenge.test.tsx \
       src/routes/_authenticated.mfa-enroll.tsx src/routes/sign-in/mfa.tsx
```

- [ ] **Step 3: Update help-content.ts** — remove the `"mfa"`, `"totp"`, `"backup_codes"` members from the `HelpContentKey` union AND their three entries from `HELP_CONTENT`. Update the `otp` entry copy:

```ts
  otp: {
    title: "Email sign-in code",
    description:
      "A one-time, 8-digit code that Supabase emails to you to prove you control the inbox. It expires in 60 minutes. Enter it back into the sign-in form to start a session. No password is ever stored.",
  },
```

- [ ] **Step 4: Update the coverage test** — in `help-tooltip.feature-007-coverage.test.tsx`: remove `'mfa'`, `'totp'`, `'backup_codes'` from `FEATURE_007_KEYS`; remove the `MfaChallenge`/`MfaEnrollment` imports (lines 125–126) and their two JSX renders (lines 141–145).

- [ ] **Step 5: Remove the dependency**

```bash
cd frontend && npm uninstall qrcode.react
```

- [ ] **Step 6: Commit**

```bash
git add -A frontend
git commit -m "feat(auth): delete TOTP UI, routes, help entries, and qrcode.react"
```

---

### Task 5: Regenerate route tree + full green build/test

**Files:**
- Regenerate: `frontend/src/routeTree.gen.ts` (generated; TDD-exempt)

- [ ] **Step 1: Regenerate the route tree** (the two deleted routes must leave it):

Run: `cd frontend && npx tsr generate`
Expected: `routeTree.gen.ts` no longer references `mfa-enroll` or `sign-in/mfa`. (If `tsr` is unavailable, `npm run build` regenerates it via the Vite router plugin.)

- [ ] **Step 2: Typecheck + build**

Run: `cd frontend && npm run build`
Expected: PASS (no TS errors, Vite build succeeds).

- [ ] **Step 3: Full test suite**

Run: `cd frontend && npx vitest run`
Expected: PASS. (Pre-existing `price-chart.test.tsx` failures are unrelated; note them but they do not block.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routeTree.gen.ts
git commit -m "chore(auth): regenerate route tree without MFA routes"
```

---

### Task 6: Set Supabase email-OTP length to 8

**Files:**
- Modify: `backend/supabase/config.toml`

- [ ] **Step 1: Local config** — in `config.toml`, set `[auth.email] otp_length = 8` (was 6). Leave `[auth.mfa.totp] enroll_enabled = false`.

- [ ] **Step 2: Commit**

```bash
git add backend/supabase/config.toml
git commit -m "chore(auth): local Supabase email OTP length = 8"
```

- [ ] **Step 3: Production project** — set email OTP length to 8 and disable TOTP enrollment on `qkrfydcfeqrchhrjltlh`. Primary path: Supabase Dashboard → Authentication → Sign In / Providers → Email → "Email OTP Length" = 8; and Authentication → Multi-Factor → disable TOTP. Alternative (Management API, requires a personal access token):

```bash
curl -s -X PATCH "https://api.supabase.com/v1/projects/qkrfydcfeqrchhrjltlh/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mailer_otp_length": 8, "mfa_totp_enroll_enabled": false}'
```

Verify field names against the live response (`GET .../config/auth`) before trusting them.

- [ ] **Step 4: Verify end-to-end** — request a sign-in code on the deployed app and confirm the emailed code is 8 digits and that sign-in completes with no authenticator prompt.

---

## Self-Review

- **Spec coverage:** §3 frontend → Tasks 1–5; §4 Supabase config → Task 6; §5 backend no-change → not a task (correct); §7 testing → folded into Tasks 1–5 (OtpCodeForm, AuthProvider, coverage test, full suite). ✓
- **Placeholders:** none — every code step shows the actual change.
- **Type consistency:** `verifyOtp` becomes `Promise<void>` in Task 2 and its only consumer (`sign-in/index.tsx`) is updated in the same task; removed help keys (`mfa`/`totp`/`backup_codes`) are scrubbed from both the union and the coverage test in Task 4.
- **Open risk:** Management API field names in Task 6 Step 3 are flagged for verification; dashboard path is the safe default.
