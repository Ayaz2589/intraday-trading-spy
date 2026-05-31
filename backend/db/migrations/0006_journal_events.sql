-- 0006_journal_events.sql
-- Catch-all event stream. See data-model.md §6.
-- Constitution VII: journal/logger.py is the single writer — enforced in app code.

CREATE TABLE IF NOT EXISTS public.journal_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id      UUID REFERENCES public.runs(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    occurred_at TIMESTAMPTZ NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN (
        'force_flat', 'risk_decision', 'error', 'lifecycle',
        'cloud_push_success', 'cloud_push_failure', 'other'
    )),
    severity    TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error')),
    message     TEXT NOT NULL,
    details     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS journal_events_run_occurred_idx ON public.journal_events (run_id, occurred_at);
CREATE INDEX IF NOT EXISTS journal_events_user_occurred_idx ON public.journal_events (user_id, occurred_at DESC);
