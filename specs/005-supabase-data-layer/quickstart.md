# Quickstart — Cloud-Persisted Backtest Storage

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This guide takes an operator from "fresh laptop" to "first run pushed to Supabase" in under 30 minutes (SC-003). It assumes the rest of the project (existing CLI, local backtest workflow) is already working.

## Prerequisites

- The existing project quickstart works on this machine. `make test` is green; `make backtest` produces output in `backend/data/backtests/`.
- Docker Desktop installed and running (for the local Supabase instance used by integration tests).
- Node.js ≥18 (the Supabase CLI is a Node binary).

## 1. Install the Supabase CLI

```bash
# macOS / Linux
brew install supabase/tap/supabase
# or
npm install -g supabase
```

Verify:

```bash
supabase --version
# Expected: supabase version 1.x.x or 2.x.x
```

## 2. Create a Supabase project (dev)

1. Go to https://supabase.com → Sign up (the first time only).
2. Create a new project. Choose a region close to you. Use a strong DB password (Supabase stores it; you won't type it again often).
3. Wait ~2 minutes for provisioning.
4. From the project dashboard, copy:
   - **Project URL** (format `https://abcdefgh.supabase.co`)
   - **Service-role key** — Settings → API → `service_role` (this is a secret; never check it into git).
   - **Project ref** — Settings → General → Project ID (short slug).

## 3. Wire the CLI to the project

From the repo root:

```bash
cd backend
supabase login                       # opens browser, authorizes the CLI
supabase link --project-ref <REF>    # paste your project ref
```

This creates `backend/.supabase/` (git-ignored) with the link metadata.

## 4. Apply the migrations

```bash
# From backend/
supabase db push
```

The Supabase CLI applies every file in `backend/db/migrations/` in order. Expected output:

```
Applying migration 0001_strategies.sql...
Applying migration 0002_configs.sql...
...
Applying migration 0040_storage_buckets.sql...
Finished supabase db push.
```

Verify the schema landed via the Supabase dashboard → Table Editor. You should see all 7 tables and one row in `strategies` (`vwap_pullback_long`).

## 5. Create your operator account

1. Open the Supabase dashboard → Authentication → Users.
2. Click "Add user" → invite via email.
3. Check your email; click the OTP link or enter the 6-digit code in the dashboard sign-in.
4. **Enroll MFA**: Authentication → MFA → "Enable MFA for this user" → scan the QR with Google Authenticator / 1Password.
5. **Save the backup codes** displayed during enrollment. Without them, a lost authenticator means a manual reset.
6. Note your **user_id** (UUID) from the Users table — you'll need it as `SUPABASE_USER_ID`.

## 6. Set environment variables

Create `backend/.env` (already in `.gitignore`):

```bash
SUPABASE_URL=https://abcdefgh.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJ...        # the service_role key
SUPABASE_USER_ID=00000000-0000-0000-0000-000000000000   # your auth.users id
```

Load it (or use `direnv` / `envrc`):

```bash
set -a; source .env; set +a
```

## 7. Run a backtest and push it

Use the bundled fixture for a first run:

```bash
make backtest                                  # local-only, baseline (unchanged behavior)
make backtest PUSH=1                           # add --push-to-supabase
# or directly:
intraday-trade-spy-backtest --push-to-supabase
```

Expected console output ends with:

```
Pushed run 01h... to Supabase
```

## 8. Verify the push

From the Supabase dashboard → Table Editor:

- `runs` should have one new row matching the run_id printed above.
- `trades` should match the local `backend/data/backtests/<run_id>/trades.csv` row-for-row.
- `signals` should include both executed signals (with `trade_id` set) AND rejected signals (with `rejection_reason` set).
- `journal_events` should include lifecycle events plus a `cloud_push_success` entry.

Or via psql:

```bash
psql "$(supabase status --output env | grep DB_URL | cut -d= -f2-)"

SELECT id, finished_at, (summary->>'pnl')::numeric AS pnl, (summary->>'total_trades')::int AS trades
  FROM runs ORDER BY started_at DESC LIMIT 5;
```

## 9. Run the integration tests

```bash
# From backend/
make test                  # offline suite (no Docker needed)
make test-integration      # brings up a local Supabase via Docker, runs RLS + push tests
```

Expected: all tests pass. If `make test-integration` complains about Docker, ensure Docker Desktop is running.

## 10. Common errors

| Error | Cause | Fix |
|---|---|---|
| `--push-to-supabase requires SUPABASE_URL ...` | Env var unset | Re-source `.env` |
| `health_check: 401 Unauthorized` | Wrong service-role key | Re-copy from dashboard; ensure no trailing whitespace |
| `push_run: caller user_id mismatch` | `SUPABASE_USER_ID` doesn't match any auth.users row | Re-copy from Users table |
| `duplicate key value violates unique constraint "runs_pkey"` | Same `run_id` already pushed (intentional retry of a successful run) | This is expected behavior — each run is one row, retries don't replace it |
| `supabase db push fails with "must be owner of ..."` | Linked to wrong project or insufficient permissions | `supabase link --project-ref <REF>` again with the right ref |

## 11. Constitutional check on first push

Run this query post-push to confirm constitutional invariants persisted:

```sql
-- All your configs must have live_auto_enabled = false
SELECT count(*) FROM configs WHERE live_auto_enabled = TRUE;
-- Expected: 0

-- All executed signals must have stop AND target
SELECT count(*) FROM signals WHERE executed = TRUE AND (stop_price IS NULL OR target_price IS NULL);
-- Expected: 0

-- All trades must have stop AND target (NOT NULL)
SELECT count(*) FROM trades WHERE stop_price IS NULL OR target_price IS NULL;
-- Expected: 0 (NOT NULL constraint at the DB enforces this)

-- Rejected signals must have a rejection_reason
SELECT count(*) FROM signals WHERE executed = FALSE AND rejection_reason IS NULL;
-- Expected: 0
```

Every one of these queries returning 0 is a check on the constitution principles I, II, III, V, VII at the data layer.

## Where to go next

- [spec.md](./spec.md) — feature requirements
- [plan.md](./plan.md) — technical plan + constitution check
- [data-model.md](./data-model.md) — full schema
- [contracts/](./contracts/) — CLI, storage-client, and migration contracts
- After this feature ships, see [`docs/migrations/2026-05-30-supabase-vercel-migration.md`](../../docs/migrations/2026-05-30-supabase-vercel-migration.md) for the road ahead (features 006-008).
