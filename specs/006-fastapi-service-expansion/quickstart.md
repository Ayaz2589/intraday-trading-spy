# Quickstart — Authenticated HTTP Backend for Backtests

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This guide takes an operator from "Feature 005 working" to "I just triggered a backtest via curl and watched it complete." Assumes Feature 005's quickstart is complete (Supabase project provisioned, migrations applied, `.env` populated, the CLI push path verified).

## Prerequisites

- Feature 005 quickstart complete and `make backtest PUSH=1` works.
- `backend/.env` populated with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_USER_ID`.
- Docker Desktop (optional, only for the container-image step at the end).

## 1. Apply the new migrations

Two new schema changes, one new table:

```bash
cd backend
supabase db push        # applies 0050, 0051, 0060
```

Expected output:
```
Applying migration 0050_journal_event_kinds.sql...
Applying migration 0051_runs_status.sql...
Applying migration 0060_data_download_jobs.sql...
Finished supabase db push.
```

Verify the `runs.status` column landed:
```bash
curl -sS "$SUPABASE_URL/rest/v1/runs?select=id,status&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
# Existing rows are backfilled to status='finished'
```

## 2. Install the new dependency

```bash
.venv/bin/pip install -e ".[dev]"
# adds pyjwt[crypto]>=2.9
```

## 3. Run the service

```bash
set -a; source .env; set +a
.venv/bin/uvicorn intraday_trade_spy.api.app:app --host 127.0.0.1 --port 8000 --reload
```

Or via the Makefile:
```bash
make api-dev       # equivalent shortcut
```

The service is up on `http://127.0.0.1:8000`.

## 4. Confirm the health check

```bash
curl -sS http://127.0.0.1:8000/healthz
# {"status":"ok","db":"ok"}
```

## 5. Mint a test JWT (or grab one from the dashboard)

The service expects a Supabase-issued JWT in `Authorization: Bearer <jwt>`. Two options:

**Option A — Get a real JWT via OTP signin:**
1. From the Supabase dashboard → Authentication → Users, click your row → "Send magic link to ayaz2589@gmail.com."
2. Click the link in your email. Supabase redirects (the URL contains `access_token=...` in the fragment).
3. Copy the `access_token` from the URL.

**Option B — Mint a test JWT yourself** (development only):
```bash
python -c "
import jwt, time, os
payload = {
    'aud': 'authenticated',
    'sub': os.environ['SUPABASE_USER_ID'],
    'iat': int(time.time()),
    'exp': int(time.time()) + 3600,
    'role': 'authenticated',
}
# For LOCAL Supabase (supabase start), the JWT secret is well-known.
# For your cloud project, you'd use the project's JWT secret (Project Settings → API → JWT Secret).
print(jwt.encode(payload, os.environ['SUPABASE_JWT_SECRET'], algorithm='HS256'))
"
```

Export it:
```bash
export ACCESS_TOKEN=eyJ...
```

## 6. List your strategies

```bash
curl -sS http://127.0.0.1:8000/api/strategies \
  -H "Authorization: Bearer $ACCESS_TOKEN"
# {"strategies":[{"key":"vwap_pullback_long","display_name":"VWAP Pullback (Long)",...}]}
```

If you get 401, double-check the token.

## 7. Start a backtest

First, ensure you have a config named "default" (Feature 005's CLI push creates one):
```bash
make backtest PUSH=1     # this also upserts a config named "default"
```

Now trigger a backtest via the API:
```bash
curl -sS -X POST http://127.0.0.1:8000/api/backtests \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"config_name": "default"}'
# {"run_id":"<UUID>","status":"queued"}
```

Save the run_id:
```bash
export RUN_ID=<UUID-from-response>
```

## 8. Poll the status

```bash
for i in 1 2 3 4 5 6 7 8 9 10; do
  status=$(curl -sS http://127.0.0.1:8000/api/runs/$RUN_ID/status \
    -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -c "import sys, json; print(json.load(sys.stdin)['status'])")
  echo "[$i] status=$status"
  if [ "$status" = "finished" ] || [ "$status" = "failed" ]; then
    break
  fi
  sleep 2
done
```

Expected: `queued → running → finished` within ~30 seconds on the bundled fixture.

## 9. Fetch the run results

```bash
curl -sS http://127.0.0.1:8000/api/runs/$RUN_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -m json.tool

curl -sS http://127.0.0.1:8000/api/runs/$RUN_ID/trades \
  -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -m json.tool

curl -sS "http://127.0.0.1:8000/api/runs/$RUN_ID/signals?executed=false" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -m json.tool

curl -sS http://127.0.0.1:8000/api/runs/$RUN_ID/journal \
  -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -m json.tool
```

The trades, signals, and journal events match exactly what Feature 005's CLI push wrote — same data, same shape, scoped to your account.

## 10. Run the test suite

```bash
make test                    # offline; includes new unit tests for endpoints + auth
make test-integration        # requires SUPABASE_INTEGRATION=1 + Docker
make test-api-integration    # NEW — end-to-end via FastAPI TestClient + local Supabase
```

## 11. Build the Docker image

```bash
cd backend
docker build -t intraday-trade-spy:dev .
docker run --rm -p 8000:8000 --env-file .env intraday-trade-spy:dev
```

Same endpoints, same behavior — that's the image Feature 008 will deploy to Fly.io.

## 12. Common errors

| Error | Cause | Fix |
|---|---|---|
| `401 missing_or_invalid_token` | Header missing, wrong, or expired | Re-mint or re-fetch the token |
| `404 config_not_found` | No config named "default" for this user | `make backtest PUSH=1` to create one |
| `429 concurrent_run_cap_exceeded` | 5 active runs already | Wait for one to finish |
| `503 db_unreachable` | Supabase down or wrong URL | Check `SUPABASE_URL` and that the project is up |
| `400 validation_error` (data download) | end_date < start_date or range > 60 days | Adjust dates |

## 13. Where to go next

- [spec.md](./spec.md) — feature requirements
- [plan.md](./plan.md) — implementation plan + constitution check
- [data-model.md](./data-model.md) — schema additions
- [contracts/](./contracts/) — endpoint, auth, and background-task contracts
- After this feature ships, [`../../docs/migrations/2026-05-30-supabase-vercel-migration.md`](../../docs/migrations/2026-05-30-supabase-vercel-migration.md) — Feature 007 (frontend auth + API migration) and Feature 008 (production deployment) follow.
