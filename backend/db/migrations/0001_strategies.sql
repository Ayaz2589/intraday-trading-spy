-- 0001_strategies.sql
-- Strategy registry. See specs/005-supabase-data-layer/data-model.md §1.
-- Adding a strategy = adding a row + a Python module that registers itself.
-- Constitution I (SPY-only), II (long-only rule-based) enforced via CHECK.

CREATE TABLE IF NOT EXISTS public.strategies (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key          TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description  TEXT NOT NULL,
    symbol       TEXT NOT NULL DEFAULT 'SPY' CHECK (symbol = 'SPY'),
    direction    TEXT NOT NULL CHECK (direction = 'LONG'),
    kind         TEXT NOT NULL CHECK (kind = 'rule_based'),
    enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS strategies_key_idx ON public.strategies (key);
