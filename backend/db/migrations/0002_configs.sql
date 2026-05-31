-- 0002_configs.sql
-- Per-user backtest configs. See data-model.md §2.
-- Replaces the single backend/config/config.yaml (which remains the canonical
-- default; cloud rows are per-user overrides).
-- Constitution V: live_auto_enabled CHECK pinned FALSE for v1.

CREATE TABLE IF NOT EXISTS public.configs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    strategy_id       UUID NOT NULL REFERENCES public.strategies(id),
    name              TEXT NOT NULL,
    mode              TEXT NOT NULL CHECK (mode IN ('backtest', 'paper')),
    live_auto_enabled BOOLEAN NOT NULL DEFAULT FALSE CHECK (live_auto_enabled = FALSE),
    timeframe         TEXT NOT NULL DEFAULT '5m' CHECK (timeframe = '5m'),
    params            JSONB NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS configs_user_id_idx ON public.configs (user_id);
