# Contract: `--push-to-supabase` CLI flag

**Subject**: The `intraday-trade-spy-backtest` console script gains an optional flag that, when present, uploads the completed run to the operator's Supabase account.

## Surface

```text
intraday-trade-spy-backtest \
    [--config CONFIG_PATH] \
    [--data DATA_CSV] \
    [--push-to-supabase] \
    [--config-name NAME]
```

| Flag | Type | Default | Behavior |
|---|---|---|---|
| `--push-to-supabase` | bool flag | absent (no push) | When present, the run is uploaded to Supabase after the engine completes. |
| `--config-name NAME` | str | `default` | Operator label for the `configs` row that captures the YAML's contents. If a row with `(user_id, name=NAME)` already exists for this user, the existing row is reused; otherwise a new one is upserted. |

When `--push-to-supabase` is **absent**: the CLI's behavior is bit-for-bit identical to the current implementation (FR-013, SC-004).

When `--push-to-supabase` is **present**: the CLI's existing local behavior is preserved AND the run is also pushed to Supabase.

## Pre-flight (before engine starts)

1. The CLI reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment.
2. If either is missing → the CLI exits with code 2 and the message:
   ```
   --push-to-supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars to be set.
   ```
3. The CLI also reads `SUPABASE_USER_ID` (the operator's auth.users id) — required so the service role knows which user to write on behalf of.
   - If missing → same exit-code-2 pattern with a clear message naming `SUPABASE_USER_ID`.
4. The CLI performs a lightweight reachability check (`GET {SUPABASE_URL}/rest/v1/strategies?select=key&limit=1`) within a 5-second timeout. On failure → exits with code 3 and an error naming the timeout / status code.

## Engine run (unchanged)

The backtest engine runs to completion exactly as today. All existing local outputs (manifest JSON, trades CSV, journal CSV) are produced in `data/backtests/{run_id}/`. The `run_id` used locally is the same UUID v7 the cloud push will use.

## Post-flight (after engine completes)

1. The CLI loads the local run outputs into Pydantic models (`PushRunPayload`).
2. The CLI calls `supabase.rpc('push_run', {payload: payload.model_dump(mode='json')})`.
3. On success:
   - The CLI emits a journal `cloud_push_success` event locally AND in Supabase.
   - The CLI prints `Pushed run {run_id} to Supabase` and exits 0.
4. On RPC error (network, auth, validation, RLS denial):
   - The CLI emits a journal `cloud_push_failure` event LOCALLY (Supabase isn't reachable).
   - The CLI prints the error message verbatim plus a remediation hint.
   - The CLI exits with code 4. Local outputs are preserved.
5. On Pydantic validation error (the local payload can't be coerced into the schema):
   - The CLI prints which field failed (Pydantic's default error formatting).
   - The CLI exits with code 5. Local outputs are preserved.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success (engine completed; push succeeded if requested) |
| 1 | Engine error (existing behavior — not changed by this feature) |
| 2 | Missing required env var for `--push-to-supabase` |
| 3 | Supabase reachability check failed |
| 4 | Cloud push RPC failed |
| 5 | Pydantic validation of payload failed |

## Test obligations (from spec FR-005, FR-007, FR-013, FR-014; SC-004, SC-005)

- **Test**: `--push-to-supabase` absent → no environment variable is read; no network call is made; existing local outputs are bit-identical to the pre-feature behavior.
- **Test**: `--push-to-supabase` present with missing `SUPABASE_URL` → exits 2 with the documented message.
- **Test**: `--push-to-supabase` present with valid env + reachable Supabase → push succeeds; row in `runs` matches local manifest; `cloud_push_success` event in both local journal and Supabase `journal_events`.
- **Test**: `--push-to-supabase` present with valid env but unreachable Supabase → exits 3 (or 4 depending on timing); local outputs preserved; `cloud_push_failure` event in local journal.
- **Test**: `--push-to-supabase` present with an intentionally malformed payload (e.g., a hand-edited trade row missing `stop_price`) → exits 5; Pydantic error printed; no row in Supabase.
