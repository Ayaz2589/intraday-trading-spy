-- 0127_journal_campaign_kind.sql — Feature 019 (live-found 2026-06-07)
--
-- The campaign engine journals every stage transition with kind='campaign'
-- (constitution VII; engine tests pin the kind), but the journal_events kind
-- CHECK list (last extended in 0050) predates campaigns — the first stage
-- write violated it and the campaign failed soft. Extend the whitelist.

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
        'auth_failure',
        -- Feature 019: auto-research campaign stage/verdict events
        'campaign'
    ));
