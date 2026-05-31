-- 0060_data_download_jobs.sql
-- Async yfinance download jobs. Mirrors the run-lifecycle pattern.
-- See data-model.md §3.

CREATE TABLE IF NOT EXISTS public.data_download_jobs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    start_date        DATE NOT NULL,
    end_date          DATE NOT NULL CHECK (end_date >= start_date),
    status            TEXT NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','running','finished','failed')),
    storage_path      TEXT,
    status_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    failure_reason    TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS data_download_jobs_user_created_idx
    ON public.data_download_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS data_download_jobs_status_idx
    ON public.data_download_jobs (status, status_updated_at);

ALTER TABLE public.data_download_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS data_download_jobs_user_isolation ON public.data_download_jobs;
CREATE POLICY data_download_jobs_user_isolation ON public.data_download_jobs
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS data_download_jobs_service_role_all ON public.data_download_jobs;
CREATE POLICY data_download_jobs_service_role_all ON public.data_download_jobs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
