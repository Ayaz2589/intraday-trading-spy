-- 0128_signals_entry_window_reason.sql — Feature 020
--
-- Window-skipped setups push to the cloud as un-executed signals with
-- rejection_reason 'entry_window' (the tooltip promises "you can see exactly
-- what the filter declined"). Extend the 0005 CHECK list; the Pydantic
-- RejectionReason literal is extended in the same commit so model and
-- constraint cannot drift.

ALTER TABLE public.signals
    DROP CONSTRAINT IF EXISTS signals_rejection_reason_check;

ALTER TABLE public.signals
    ADD CONSTRAINT signals_rejection_reason_check CHECK (
        rejection_reason IS NULL OR rejection_reason IN (
            'missing_stop', 'missing_target', 'wrong_symbol', 'wrong_direction',
            'daily_loss_hit', 'max_trades_hit', 'duplicate_signal',
            'position_size_cap', 'stale_data', 'opening_range_not_complete',
            'cooldown_after_loss', 'consecutive_loss_cap', 'no_new_trades_cutoff',
            'force_flat_window', 'other',
            -- Feature 020: suppressed by the config's entry window
            'entry_window'
        )
    );
