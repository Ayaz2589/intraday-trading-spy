# Sign-in: Adopt the Design System — Design

**Date**: 2026-06-02
**Status**: Approved — implementation via direct TDD off this doc
**Topic**: Rebuild the sign-in flow (page + email form + OTP form) on the
feature-004 design-system tokens and component classes.

---

## 1. Motivation

The sign-in flow is the only surface in `frontend/src/` still written against
shadcn-style utility classes — `bg-primary`, `text-primary-foreground`,
`text-muted-foreground`, `text-destructive`, bare `border rounded`. **None of
those tokens are defined** in this Tailwind v4 + design-system setup (the system
uses `--accent`, `--surface`, `--text-muted`, `--loss`, and CSS component
classes like `.card`, `.btn .btn-primary`). The result: the sign-in screen
renders effectively unstyled / off-brand while the rest of the app is on the
design system adopted in `specs/004-design-system-adoption/`.

This doc covers reskinning the flow onto the real design system. **No behavior,
auth, or routing changes** — visual only.

## 2. Goals / Non-goals

**Goals**
- Sign-in page, `SignInForm`, and `OtpCodeForm` all use design-system tokens and
  component classes.
- A polished, centered "auth card" layout with the `◑ IntradayBuilder` brand
  lockup (identical to the topbar) and a tagline footer.
- Works in both dark (primary) and light themes purely via tokens.
- Preserve every test hook → existing unit tests stay green (Constitution IV: TDD).
- Keep the educational `HelpTooltip` on the email step (Constitution VI).

**Non-goals**
- No changes to `AuthProvider`, Supabase client, routing, or the OTP/email logic.
- No change to copy/behavior (8-digit code, whitespace strip, cap-at-8, stage
  swap, "Use a different email" all unchanged).
- Not touching the off-token `<Card>`/`ui` React components (out of scope).

## 3. Design decisions

- **Use the token-driven CSS classes, not the React `ui` components.** `.card`
  and `.btn`/`.btn-primary` in `globals.css` are token-aligned; the `<Card>`
  React component hardcodes `gray-200`/`slate-900` and is *not*. So the screen
  uses `.card` (class) + `.btn .btn-primary` (class, also what `<Button>` emits).
- **Add the missing generic text input.** The system only has the specialized
  `.knob-field input` (mono, right-aligned, fixed width). Auth needs a normal
  full-width left-aligned field, so we add a reusable `.field` class.
- **Keep additions in `globals.css` under a labeled "project addition" section.**
  `globals.css` mirrors the design handoff, but already carries project-only
  extensions (e.g. react-day-picker bindings, manual sidebar collapse). The auth
  styles go in a clearly-commented `AUTH SCREEN (project addition, not in
  handoff)` block so the mirror boundary stays legible.

## 4. CSS additions (`frontend/src/styles/globals.css`)

New section, all token-driven (no hardcoded colors):

| Class | Purpose |
|---|---|
| `.auth-screen` | `min-height: 100dvh`, grid place-items center, padding, `background: var(--bg-app)` |
| `.auth-box` | flex column, `gap: var(--sp-5)`, `width: 100%`, `max-width: 400px` |
| `.auth-brand` | center the `.brand` lockup; slight letter spacing |
| `.auth-card` | `.card` + form padding (`var(--sp-6)`) |
| `.auth-title` | `font-size: var(--fs-xl)`, weight 700, `tracking-tight` |
| `.auth-intro` | `font-size: var(--fs-sm)`, `color: var(--text-muted)`, bottom margin |
| `.field` | full-width input: `surface-2` bg, `1px var(--border)`, `--r-sm`, `--fs-sm`, padding ~`10px 12px`, `color: var(--text)` |
| `.field:focus` | `border-color: var(--border-accent)`, `box-shadow: 0 0 0 3px var(--accent-soft)`, no outline — mirrors `.knob-field:focus-within` |
| `.field::placeholder` | `color: var(--text-faint)` |
| `.btn-block` | `width: 100%; justify-content: center;` (composes with `.btn .btn-primary` / `.btn-ghost`) |
| `.auth-error` | `font-size: var(--fs-sm)`, `color: var(--loss)` |
| `.auth-foot` | centered tagline, `font-size: var(--fs-xs)`, `color: var(--text-faint)` |

## 5. Component changes

### `routes/sign-in/index.tsx`
Replace the `max-w-md mx-auto mt-16 p-6 border rounded-lg` container with the
auth layout:
```
.auth-screen
  .auth-box (data-testid="signin-page")
    .auth-brand → .brand ( .brand-mark ◑ + .brand-name Intraday/.brand-dim Builder )
    .auth-card  → .auth-title "Sign in" + <SignInForm/> | <OtpCodeForm/>
    .auth-foot  → "SPY · 5m research builder"
```
Stage state, search params, and submit handlers unchanged. `data-testid`
`signin-page` is preserved (moves to `.auth-box`).

### `components/auth/SignInForm.tsx`
- Intro `<p>` → `.auth-intro` (was `text-sm text-muted-foreground`); keep
  `HelpTooltip`.
- `<input>` → `className="field"` (was `w-full p-2 border rounded mb-2`); keep
  `type=email`, `aria-label="Email"`, `placeholder`, `required`.
- Error `<p role="alert">` → `.auth-error` (was `text-destructive`).
- Submit `<button>` → `className="btn btn-primary btn-block"`; keep
  text "Send sign-in code" / "Sending…", `disabled` logic, `data-testid`.
- Add small layout gap between fields (`.auth-intro`/field/button spacing via
  margins or a wrapping flex column).

### `components/auth/OtpCodeForm.tsx`
- Intro `<p>` → `.auth-intro`; keep the `<strong>{email}</strong>`.
- Code `<input>` → `className="field mono"` (mono suits the digit code); keep
  `inputMode`, `autoComplete="one-time-code"`, `aria-label="Sign-in code"`,
  `normalize` (strip whitespace, cap 8), `required`.
- Error `<p role="alert">` → `.auth-error`.
- Submit `<button>` → `btn btn-primary btn-block` ("Verify code" / "Verifying…").
- "Use a different email" `<button>` → `btn btn-ghost btn-block`; keep text and
  `onClick`.

## 6. Testing (TDD)

Existing tests assert behavior via `data-testid`, `aria-label` ("Email",
"Sign-in code"), button accessible names, and `role="alert"` — all preserved, so
`SignInForm.test.tsx` and `OtpCodeForm.test.tsx` stay green as the regression
guard.

New test (`routes/sign-in/__tests__` or alongside route): render the sign-in
page and assert the brand mark (`◑` / `.brand-name`) and the auth card render —
written first (red), then satisfied by the layout change.

Verification gate before "done": `npm run test`, `npm run typecheck`, and
`npm run build` all green; visual check in dark + light themes.

## 7. Constitution check

- **IV (TDD):** new page test written first; existing form tests stay green. ✔
- **VI (educational UI):** `HelpTooltip` on the email step retained. ✔
- Other principles (SPY-only, risk veto, paper-first, journaling) untouched —
  this is a presentational change with no trading-logic surface. ✔
