-- 0004_trades.sql
-- Executed trades within a run. See data-model.md §4.
-- Constitution III: stop_price + target_price NOT NULL — no trade without both.
-- Constitution II: direction CHECK = 'LONG'.

CREATE TABLE IF NOT EXISTS public.trades (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id       UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    direction    TEXT NOT NULL CHECK (direction = 'LONG'),
    quantity     NUMERIC(12, 4) NOT NULL CHECK (quantity > 0),
    entry_at     TIMESTAMPTZ NOT NULL,
    entry_price  NUMERIC(12, 6) NOT NULL CHECK (entry_price > 0),
    stop_price   NUMERIC(12, 6) NOT NULL CHECK (stop_price > 0),
    target_price NUMERIC(12, 6) NOT NULL CHECK (target_price > 0),
    exit_at      TIMESTAMPTZ NOT NULL,
    exit_price   NUMERIC(12, 6) NOT NULL CHECK (exit_price > 0),
    exit_reason  TEXT NOT NULL CHECK (exit_reason IN ('target', 'stop', 'force_flat', 'timeout', 'other')),
    pnl          NUMERIC(18, 6) NOT NULL,
    r_multiple   NUMERIC(8, 4) NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trades_run_idx ON public.trades (run_id);
CREATE INDEX IF NOT EXISTS trades_user_entry_idx ON public.trades (user_id, entry_at DESC);
