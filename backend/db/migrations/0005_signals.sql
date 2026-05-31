-- 0005_signals.sql
-- Every signal emitted during a run — executed AND rejected. See data-model.md §5.
-- Constitution VII: rejected signals are first-class records.
-- Discriminator: executed BOOLEAN; rejection_reason CHECK list; trade_id FK.

CREATE TABLE IF NOT EXISTS public.signals (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id             UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
    user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    emitted_at         TIMESTAMPTZ NOT NULL,
    direction          TEXT NOT NULL CHECK (direction = 'LONG'),
    entry_price        NUMERIC(12, 6) NOT NULL CHECK (entry_price > 0),
    stop_price         NUMERIC(12, 6) CHECK (stop_price IS NULL OR stop_price > 0),
    target_price       NUMERIC(12, 6) CHECK (target_price IS NULL OR target_price > 0),
    executed           BOOLEAN NOT NULL,
    rejection_reason   TEXT CHECK (
        rejection_reason IS NULL OR rejection_reason IN (
            'missing_stop', 'missing_target', 'wrong_symbol', 'wrong_direction',
            'daily_loss_hit', 'max_trades_hit', 'duplicate_signal',
            'position_size_cap', 'stale_data', 'opening_range_not_complete',
            'cooldown_after_loss', 'consecutive_loss_cap', 'no_new_trades_cutoff',
            'force_flat_window', 'other'
        )
    ),
    trade_id           UUID REFERENCES public.trades(id),
    indicator_context  JSONB NOT NULL,
    reason_text        TEXT NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT signals_executed_xor_rejected CHECK (
        (executed = TRUE AND rejection_reason IS NULL AND trade_id IS NOT NULL)
        OR
        (executed = FALSE AND rejection_reason IS NOT NULL AND trade_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS signals_run_idx ON public.signals (run_id);
CREATE INDEX IF NOT EXISTS signals_user_emitted_idx ON public.signals (user_id, emitted_at DESC);
CREATE INDEX IF NOT EXISTS signals_run_executed_idx ON public.signals (run_id, executed);
