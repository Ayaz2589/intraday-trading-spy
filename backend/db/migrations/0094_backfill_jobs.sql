-- 0094_backfill_jobs.sql
-- Feature 009 (Phase 0 data foundation).
-- Durable status + progress for the in-app bulk historical backfill.
-- Mirrors data_download_jobs (0060). See specs/009-data-foundation/data-model.md.

CREATE TABLE IF NOT EXISTS public.backfill_jobs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status            TEXT NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','running','finished','failed')),
    source            TEXT NOT NULL DEFAULT 'alpaca',
    range_start       DATE NOT NULL,
    range_end         DATE NOT NULL CHECK (range_end >= range_start),
    windows_total     INTEGER NOT NULL DEFAULT 0 CHECK (windows_total >= 0),
    windows_done      INTEGER NOT NULL DEFAULT 0 CHECK (windows_done >= 0),
    bars_added        INTEGER NOT NULL DEFAULT 0 CHECK (bars_added >= 0),
    gap_session_dates JSONB NOT NULL DEFAULT '[]'::jsonb,
    failure_reason    TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS backfill_jobs_user_created_idx
    ON public.backfill_jobs (user_id, created_at DESC);

-- Supports the stale-job query: non-terminal jobs by recency (C1).
CREATE INDEX IF NOT EXISTS backfill_jobs_status_idx
    ON public.backfill_jobs (status, updated_at);

ALTER TABLE public.backfill_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS backfill_jobs_user_isolation ON public.backfill_jobs;
CREATE POLICY backfill_jobs_user_isolation ON public.backfill_jobs
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS backfill_jobs_service_role_all ON public.backfill_jobs;
CREATE POLICY backfill_jobs_service_role_all ON public.backfill_jobs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
