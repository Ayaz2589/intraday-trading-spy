-- 0050_journal_event_kinds.sql
-- Extend journal_events.kind CHECK list with API lifecycle + auth audit values.
-- See specs/006-fastapi-service-expansion/data-model.md §2.

ALTER TABLE public.journal_events
    DROP CONSTRAINT IF EXISTS journal_events_kind_check;

ALTER TABLE public.journal_events
    ADD CONSTRAINT journal_events_kind_check CHECK (kind IN (
        -- Existing kinds (Feature 005)
        'force_flat',
        'risk_decision',
        'error',
        'lifecycle',
        'cloud_push_success',
        'cloud_push_failure',
        'other',
        -- Feature 006 additions
        'api_request_received',
        'backtest_started',
        'backtest_finished',
        'backtest_failed',
        'data_download_started',
        'data_download_finished',
        'auth_failure'
    ));
