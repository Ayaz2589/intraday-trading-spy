-- 0092_configs_unique_name.sql
-- Enforce one config name per user on the *existing* (production) table.
--
-- 0002 declares `UNIQUE (user_id, name)` in its CREATE TABLE, but that runs
-- under `CREATE TABLE IF NOT EXISTS` — so a database whose `configs` table was
-- created before that line was added never got the constraint. That let two
-- rows named 'default' coexist for one user, which made get_config_by_name's
-- LIMIT-1 selection non-deterministic (different runs could read different
-- knobs → inconsistent results + dedup misses).
--
-- A plain unique INDEX (vs. ADD CONSTRAINT) is idempotent via IF NOT EXISTS, so
-- this is safe to run on a fresh DB (where 0002's constraint already exists —
-- the extra index is harmless) and on the legacy DB (where it's the only guard).
-- Clean up duplicate (user_id, name) rows BEFORE running this or it will error.

CREATE UNIQUE INDEX IF NOT EXISTS configs_user_name_unique_idx
  ON public.configs (user_id, name);
