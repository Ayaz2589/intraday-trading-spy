# Deployment Runbook — Live App (Feature 008)

How to take `intraday-trading-spy` from the repo to a working live app, and how
to operate it. Three services, deployed in this order:

```
Supabase (data + auth)  →  Fly.io (FastAPI backend)  →  Vercel (frontend)
```

The frontend can't function without the backend, and the backend can't
function without Supabase, so provision them bottom-up.

---

## 1. Supabase (data + auth)

1. Create a Supabase project. Note the **Project URL** and, from
   Settings → API, both the **publishable** key (`sb_publishable_…`) and the
   **service_role** key (secret — server-side only).
2. Apply the migrations + RLS + seed (`backend/supabase/` and `backend/db/`)
   per `specs/005-supabase-data-layer/quickstart.md`.
3. Enable email OTP + TOTP MFA in Auth settings.
4. Create one operator user; copy its `auth.users.id` (used as `SUPABASE_USER_ID`
   for the backend's startup bars refresh).

## 2. Fly.io (FastAPI backend)

Deploy artifacts already live in `backend/`: `Dockerfile`, `fly.toml`
(app `intraday-trading-spy`, region `iad`, health check on `/healthz`).

One-time:

```bash
cd backend
flyctl apps create intraday-trading-spy

# Runtime secrets (never commit these):
flyctl secrets set \
  SUPABASE_URL="https://<ref>.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="<service_role key>" \
  SUPABASE_USER_ID="<operator auth.users.id>" \
  CORS_ALLOW_ORIGINS="https://<your-app>.vercel.app" \
  CORS_ALLOW_ORIGIN_REGEX='^https://<your-app>(-[a-z0-9-]+)?\.vercel\.app$'
```

`CORS_ALLOW_ORIGINS` must list the Vercel **production** domain;
`CORS_ALLOW_ORIGIN_REGEX` covers Vercel **preview** URLs. Both are read by
`backend/src/intraday_trade_spy/api/app.py` (verified: prod + preview origins
allowed, unknown origins rejected).

Deploy:

- **Automated:** push to `main` touching `backend/**` runs
  `.github/workflows/deploy-backend.yml`. Requires a `FLY_API_TOKEN` repo secret
  (`flyctl tokens create deploy -x 999999h` → GitHub repo Settings → Secrets →
  Actions). Trigger manually anytime via the workflow's "Run workflow" button.
- **Manual:** `cd backend && flyctl deploy --remote-only`.

Verify: `curl https://intraday-trading-spy.fly.dev/healthz` → `200` with
`{"status":"ok","db":"ok"}`. A `503` with `db:"unreachable"` means the Supabase
secrets are missing or wrong — Fly's health check (and the runbook) gate on this.

## 3. Vercel (frontend)

In the Vercel dashboard, import `Ayaz2589/intraday-trading-spy` with:

| Setting | Value |
|---|---|
| Root Directory | `frontend` |
| Framework | Vite (auto-detected) |
| Build / Output | from `frontend/vercel.json` (`npm run build` → `dist`, with SPA rewrite) |

Environment variables (Project → Settings → Environment Variables):

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the **publishable** key (`sb_publishable_…`) — never service_role |
| `VITE_API_BASE_URL` | the Fly URL, e.g. `https://intraday-trading-spy.fly.dev` |

`frontend/src/env.ts` throws at build time in production if the two Supabase
vars are missing. Deploy auto-runs on push to the production branch.

Smoke test: open the Vercel URL → log in (email OTP + TOTP) → list runs →
start a backtest → view results.

---

## Operations

- **Backend logs:** `flyctl logs -a intraday-trading-spy`.
- **Frontend logs/analytics:** Vercel dashboard → project → Logs / Analytics.
- **Rollback backend:** `flyctl releases -a intraday-trading-spy` then
  `flyctl deploy --image <previous-image>`, or `flyctl releases rollback`.
- **Rollback frontend:** Vercel dashboard → Deployments → promote a previous one.
- **Rotate a leaked service_role key:** rotate in Supabase, then
  `flyctl secrets set SUPABASE_SERVICE_ROLE_KEY=<new>` (triggers a redeploy).
- **Cost ceiling:** Fly shared-cpu-1x/512MB + Supabase free/Pro + Vercel free
  (~$0–10/mo). No autoscaling configured.
</content>
