# Contract: Schema Migrations

**Subject**: The `backend/db/migrations/*.sql` files are the canonical, version-controlled SQL that brings a fresh Supabase Postgres database to the state required by feature 005.

## File-naming convention

```
NNNN_<short_description>.sql
```

- `NNNN` is a zero-padded 4-digit ordinal. Migrations are applied in lexical order.
- `<short_description>` is snake-case, ≤40 chars.
- The number gap (`0001` → `0010` → `0020` → `0030` → `0040`) leaves room for future inserts within the same logical group.

## Required files (this feature)

See [data-model.md](../data-model.md) §"Migration files" for the full list. The expected files are:

```
0001_strategies.sql
0002_configs.sql
0003_runs.sql
0004_trades.sql
0005_signals.sql
0006_journal_events.sql
0007_bars.sql
0010_rls_enable.sql
0011_rls_policies_strategies.sql
0012_rls_policies_user_scoped.sql
0013_rls_policies_bars.sql
0020_seed_strategies.sql
0030_push_run_function.sql
0040_storage_buckets.sql
```

## Idempotency requirement

Every migration MUST be safely re-applicable to a database that already has the prior migrations' effects. Concretely:

- `CREATE TABLE` uses `IF NOT EXISTS`
- `CREATE INDEX` uses `IF NOT EXISTS`
- `CREATE POLICY` is preceded by `DROP POLICY IF EXISTS ... ; CREATE POLICY ...`
- `INSERT ... ON CONFLICT DO NOTHING` for seed rows
- `CREATE OR REPLACE FUNCTION` for Postgres functions
- `CREATE OR REPLACE` is acceptable for views (none in this feature)

## Application contract

Migrations are applied via the Supabase CLI:

```bash
supabase db reset      # local dev — drops + reapplies all
supabase db push       # cloud — applies pending migrations to the linked project
```

The integration-test fixture (`tests/storage/conftest.py`) brings up a local Supabase instance and applies migrations as test setup.

## RLS test obligations (from spec FR-002, FR-003; SC-002)

Every migration that creates an RLS policy MUST have a corresponding test that exercises both the allowed and denied paths. The tests live in `tests/storage/test_rls.py`. The test matrix:

| Table | Anon SELECT | Wrong-user SELECT | Own SELECT | Anon INSERT | Wrong-user INSERT | Own INSERT | Service-role INSERT |
|---|---|---|---|---|---|---|---|
| `strategies` | OK | OK | OK | DENIED | DENIED | DENIED | OK |
| `configs` | DENIED | DENIED | OK | DENIED | DENIED | OK | OK |
| `runs` | DENIED | DENIED | OK | DENIED | DENIED | OK (via push_run) | OK |
| `trades` | DENIED | DENIED | OK | DENIED | DENIED | OK (via push_run) | OK |
| `signals` | DENIED | DENIED | OK | DENIED | DENIED | OK (via push_run) | OK |
| `journal_events` | DENIED | DENIED | OK | DENIED | DENIED | OK | OK |
| `bars` | DENIED | OK | OK | DENIED | DENIED | DENIED | OK |

Every cell in the matrix is one test case. The test suite uses two seeded users (`user_A`, `user_B`) plus the anon and service-role contexts.

## Seed-data test obligations (from spec FR-010)

`tests/storage/test_schema.py` verifies:
- After `supabase db reset`, the `strategies` table contains exactly one row, with `key='vwap_pullback_long'`.
- The row's `symbol = 'SPY'`, `direction = 'LONG'`, `kind = 'rule_based'`.

## Idempotency test obligations (from spec edge case "Schema applied to a non-empty database")

`tests/storage/test_schema.py` verifies:
- Running all migrations twice in a row succeeds with no exceptions.
- After the second run, the `strategies` table still has exactly one `vwap_pullback_long` row (the `ON CONFLICT DO NOTHING` prevented a duplicate).
- After the second run, no extra indexes / policies / functions exist (the `IF NOT EXISTS` / `OR REPLACE` clauses made the migrations no-ops).
