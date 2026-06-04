-- 0121_runs_config_id_nullable.sql
-- Feature 012: deleting a config must preserve run history. Make runs.config_id
-- nullable and SET NULL on delete — the run keeps its own immutable
-- config_snapshot (migration 0092), so history is intact and the FK never
-- dangles. Clarified: delete = ON DELETE SET NULL.

ALTER TABLE public.runs ALTER COLUMN config_id DROP NOT NULL;

-- Recreate the FK with ON DELETE SET NULL (existing name: runs_config_id_fkey).
ALTER TABLE public.runs DROP CONSTRAINT IF EXISTS runs_config_id_fkey;
ALTER TABLE public.runs
    ADD CONSTRAINT runs_config_id_fkey
    FOREIGN KEY (config_id) REFERENCES public.configs(id) ON DELETE SET NULL;
