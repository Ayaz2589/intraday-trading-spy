-- 0092_runs_config_snapshot.sql
-- Record the effective config each run actually used.
--
-- Until now a run only referenced config_id (the single, mutable per-user
-- "default" config), so the detail view showed whatever the config holds *now*
-- — every run displayed the last-saved knobs. This column stores a snapshot of
-- the risk/strategy knobs the run actually executed with, so each run shows its
-- own values and stays reproducible. The run-detail endpoint prefers this
-- snapshot and falls back to the live config for legacy runs (NULL snapshot).

ALTER TABLE public.runs ADD COLUMN IF NOT EXISTS config_snapshot JSONB;
