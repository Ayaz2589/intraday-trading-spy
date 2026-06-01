-- 0090_runs_is_favorite.sql
-- Per-user "favorite" flag on runs so the UI can pin notable backtests to
-- the top of the sidebar. Defaults FALSE for backward compatibility — the
-- existing legacy rows are not marked as favorites.

ALTER TABLE public.runs
    ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS runs_user_favorite_idx
    ON public.runs (user_id, is_favorite)
    WHERE is_favorite = TRUE;
