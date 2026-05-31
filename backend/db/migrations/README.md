# Database Migrations

This directory holds the canonical, version-controlled SQL that brings a fresh
Supabase Postgres database to the schema state required by `intraday-trade-spy`.

## File-naming convention

```
NNNN_<short_description>.sql
```

- `NNNN` is a zero-padded 4-digit ordinal. Migrations are applied in lexical order.
- `<short_description>` is snake-case, ≤40 chars.
- Number gaps (`0001` → `0010` → `0020` → `0030` → `0040`) leave room for
  future inserts within the same logical group.

## Idempotency requirement

Every migration MUST be safely re-applicable to a database that already has
the prior migrations' effects. Concretely:

- `CREATE TABLE` uses `IF NOT EXISTS`
- `CREATE INDEX` uses `IF NOT EXISTS`
- `CREATE POLICY` is preceded by `DROP POLICY IF EXISTS ...; CREATE POLICY ...`
- `INSERT ... ON CONFLICT DO NOTHING` for seed rows
- `CREATE OR REPLACE FUNCTION` for Postgres functions

## Applying migrations

From `backend/`:

```bash
supabase db reset      # local dev — drops + reapplies all
supabase db push       # cloud — applies pending migrations to the linked project
```

The integration-test fixture (`tests/storage/conftest.py`) brings up a local
Supabase instance and applies these migrations as test setup.

## Reference

The schema's source of truth is
[`specs/005-supabase-data-layer/data-model.md`](../../../specs/005-supabase-data-layer/data-model.md).
Each migration file's comments should cross-link to the table section it implements.
