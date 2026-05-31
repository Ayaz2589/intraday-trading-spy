# Quickstart — Web UI with Sign-In + Cloud-Backed Run Inspection

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This guide takes you from "Features 005 and 006 verified end-to-end" to "the web app at `localhost:5173` lets me sign in with email OTP + MFA and trigger backtests against my Supabase project."

## Prerequisites

- Features 005 + 006 working: `make backtest PUSH=1` lands a run in cloud; `make api-dev` serves the authenticated HTTP API on `localhost:8001`; `curl /api/strategies` with a real JWT returns the seeded strategy.
- Node.js ≥ 18 + npm.
- An authenticator app installed (Google Authenticator, 1Password, Authy, etc.) for MFA enrollment.

## 1. Install the new dependencies

```bash
cd frontend
npm install @supabase/supabase-js@^2.45 \
            @tanstack/react-router@^1 \
            @tanstack/react-query@^5 \
            qrcode.react@^4
npm install -D @tanstack/router-devtools \
               @tanstack/react-query-devtools \
               msw@^2
```

Remove the old router:

```bash
npm uninstall react-router
```

## 2. Configure environment variables

Copy the example file and populate:

```bash
cp .env.example .env.local
```

Edit `frontend/.env.local`:

```
VITE_SUPABASE_URL=https://qkrfydcfeqrchhrjltlh.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_SUszntFd8GtO-JjydhbY9Q_GnIwAvQO
VITE_API_BASE_URL=http://localhost:8001
```

Notes:
- `VITE_SUPABASE_ANON_KEY` is the **publishable** key (safe to embed in the frontend). NEVER the service-role key.
- `VITE_API_BASE_URL` points at the Feature 006 backend. Production (Feature 008) overrides this.

## 3. Apply the auto-seed migration

The new backend migration creates a starter `default` config for every new sign-up:

```bash
cd backend
supabase db push    # applies 0070_seed_default_config_on_signup.sql
```

Verify the trigger fires for new users (manual; run after first sign-in):

```bash
curl -sS "https://qkrfydcfeqrchhrjltlh.supabase.co/rest/v1/configs?select=name&user_id=eq.<your-user-id>" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | python3 -m json.tool
# Expected: [{"name": "default"}]
```

## 4. Update the Supabase Site URL

In the Supabase Dashboard → **Authentication** → **URL Configuration**, set:

```
Site URL = http://localhost:5173
Redirect URLs (allow list) =
  http://localhost:5173
  http://localhost:5173/sign-in/callback
```

(For local dev only. Feature 008 sets the production URL.)

## 5. Run the dev servers

Three terminals (or use the new top-level Make target — to be added):

```bash
# Terminal A — Feature 006 API
make api-dev    # localhost:8001

# Terminal B — Frontend Vite dev server
cd frontend
npm run dev     # localhost:5173

# (Optional) Terminal C — tail Supabase logs in the dashboard
```

Or via the project Makefile:

```bash
make dev        # parallel: api-dev + ui-dev (recipe added in Phase 6)
```

## 6. Sign in for the first time

1. Open `http://localhost:5173` in a fresh browser profile (or incognito).
2. You're redirected to `/sign-in`.
3. Enter your email. Submit.
4. Check your inbox for the 6-digit code (subject "Your sign-in code").
5. Enter the code on the next screen.
6. **First-time only**: you're routed to `/mfa-enroll`. The page shows a QR code, a plaintext secret (for typing into apps that don't scan QR), and 8 backup codes.
7. Scan the QR with your authenticator app. The app shows a rotating 6-digit code.
8. Type that code into the confirmation field. Tick the "I've saved my backup codes" box. Click Confirm.
9. You land on `/runs` — an empty runs list with a "Start Backtest" button.

Subsequent visits skip enrollment but require the TOTP code after the email OTP.

## 7. Start a backtest from the UI

1. On `/runs`, click **Start Backtest**.
2. The dialog shows:
   - Strategy selector (currently only `VWAP Pullback (Long)`)
   - Saved config selector (currently only `default`, auto-seeded)
   - Data source: select the bundled fixture
3. Click **Start**. The dialog closes. A new run appears at the top of the list with status `queued`.
4. The status flips to `running` within a second, then `finished` within ~5 seconds on the fixture.
5. Click the row. The detail view shows summary metrics, trades, signals (with executed/rejected tabs), and journal events — same data the API + CLI paths produce.

## 8. Trigger a data download

1. Navigate to `/data`.
2. Click **New Download**, pick a date range (e.g., last 5 trading days), submit.
3. The new job appears with status `queued`. Watch it transition.
4. On `finished`, the downloaded date range becomes selectable in the **Start Backtest** dialog's "Data source" dropdown.

## 9. Test cross-tab sign-out

1. Open the app in two tabs (already signed in).
2. In tab A, click **Sign Out** in the topbar menu.
3. Tab B redirects to `/sign-in` within ~100 ms.

## 10. Run the test suite

```bash
cd frontend
npm test                              # all unit tests; uses msw for HTTP mocking
npm run test:integration              # opt-in, requires FRONTEND_INTEGRATION=1 + local Supabase
```

Expected counts after Feature 007 is fully implemented: ~120-180 frontend tests passing in under 30 seconds.

## 11. Common errors

| Error | Cause | Fix |
|---|---|---|
| `Site URL not allowed` on magic-link redirect | Supabase URL Configuration not updated | Add `http://localhost:5173` to allowed list |
| `CORS error` calling /api/backtests | Feature 006 backend CORS not allowing :5173 | Already in default config; restart api-dev |
| `401 missing_or_invalid_token` after sign-in | JWT not being attached | Check `frontend/src/api/client.ts` adds Authorization header |
| `404 config_not_found` on Start Backtest | Auto-seed trigger didn't fire | Check migration 0070 was applied; check `configs` table for user_id row |
| MFA QR code doesn't render | `qrcode.react` not installed | `npm install qrcode.react` |
| Polling never stops on a `failed` run | adaptivePollingInterval bug | Check `useRunStatus.ts` hook |

## 12. Where to go next

- [spec.md](./spec.md) — full feature requirements (21 FRs, 8 SCs)
- [plan.md](./plan.md) — implementation plan + constitution check
- [research.md](./research.md) — 15 technical decisions with rationale
- [data-model.md](./data-model.md) — client state + the one new backend migration
- [contracts/](./contracts/) — routes, auth flow, data fetching, help tooltips
- After Feature 007 ships, [`../../docs/migrations/2026-05-30-supabase-vercel-migration.md`](../../docs/migrations/2026-05-30-supabase-vercel-migration.md) — Feature 008 (production deploy) wraps the migration.
