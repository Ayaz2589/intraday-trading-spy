-- 0003_runs.sql
-- One row per backtest invocation. See data-model.md §3.
-- Primary key is the client-generated UUID v7 (research §5 — retry safety).

CREATE TABLE IF NOT EXISTS public.runs (
    id               UUID PRIMARY KEY,
    user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    config_id        UUID NOT NULL REFERENCES public.configs(id),
    strategy_id      UUID NOT NULL REFERENCES public.strategies(id),
    started_at       TIMESTAMPTZ NOT NULL,
    finished_at      TIMESTAMPTZ NOT NULL,
    range_start      DATE NOT NULL,
    range_end        DATE NOT NULL CHECK (range_end >= range_start),
    bar_count        INTEGER NOT NULL CHECK (bar_count > 0),
    summary          JSONB NOT NULL,
    data_fingerprint TEXT NOT NULL,
    app_version      TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runs_user_started_idx ON public.runs (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS runs_user_strategy_idx ON public.runs (user_id, strategy_id);
