-- 0007_bars.sql
-- Shared cache of historical 5-minute SPY bars. See data-model.md §7.
-- Not user-scoped — read-public-authenticated, write-service-role-only (RLS in 0013).

CREATE TABLE IF NOT EXISTS public.bars (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bar_start  TIMESTAMPTZ NOT NULL,
    open       NUMERIC(12, 6) NOT NULL CHECK (open > 0),
    high       NUMERIC(12, 6) NOT NULL CHECK (high > 0),
    low        NUMERIC(12, 6) NOT NULL CHECK (low > 0),
    close      NUMERIC(12, 6) NOT NULL CHECK (close > 0),
    volume     BIGINT NOT NULL CHECK (volume >= 0),
    source     TEXT NOT NULL DEFAULT 'yfinance',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (bar_start, source)
);
