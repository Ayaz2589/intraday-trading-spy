-- 0110_validation_studies.sql
-- Feature 011 (Phase 2 — validation engine).
-- Parent container for a validation study that orchestrates many child runs
-- (one per walk-forward window or sensitivity grid point) and aggregates them.
-- Mirrors backfill_jobs (0094): durable status + progress for a background job.
--
-- NOTE (resolves analyze finding I1): the lockbox is NOT a study kind. A lockbox
-- one-shot is a single child run (segment='lockbox', study_id NULL) recorded in
-- lockbox_ledger (0112) — not a validation_studies row. So kind is constrained
-- to the two multi-run study types only.

CREATE TABLE IF NOT EXISTS public.validation_studies (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind               TEXT NOT NULL
                       CHECK (kind IN ('walk_forward','sensitivity')),
    status             TEXT NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued','running','finished','failed')),
    status_updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    params             JSONB NOT NULL DEFAULT '{}'::jsonb,
    progress_completed INTEGER NOT NULL DEFAULT 0 CHECK (progress_completed >= 0),
    progress_total     INTEGER NOT NULL DEFAULT 0 CHECK (progress_total >= 0),
    result             JSONB,
    failure_reason     TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS validation_studies_user_created_idx
    ON public.validation_studies (user_id, created_at DESC);

-- Supports the stale-study crash-recovery sweep: non-terminal studies by recency.
CREATE INDEX IF NOT EXISTS validation_studies_status_idx
    ON public.validation_studies (status, status_updated_at);

ALTER TABLE public.validation_studies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS validation_studies_user_isolation ON public.validation_studies;
CREATE POLICY validation_studies_user_isolation ON public.validation_studies
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS validation_studies_service_role_all ON public.validation_studies;
CREATE POLICY validation_studies_service_role_all ON public.validation_studies
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
