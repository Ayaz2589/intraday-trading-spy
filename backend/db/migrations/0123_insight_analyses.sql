-- 0123_insight_analyses.sql
-- Feature 016 (insights / pooled gate / advisory Claude narrative).
-- Two small per-user tables:
--   insight_analyses — immutable advisory analyses, pinned to the payload
--     hash they were generated from (idempotency: same hash -> return stored,
--     no provider call). The durable record of what was generated, from which
--     snapshot, by which model.
--   insight_settings — the analysis feature's enabled/paused switch. Flipped
--     off automatically on a provider billing_error (disabled_reason='billing')
--     or manually by the operator ('manual'); one-click re-enable.
-- The pooled gate itself needs NO new table — it persists into
-- validation_studies.result under the additive 'pooled_gate' key.

CREATE TABLE IF NOT EXISTS public.insight_analyses (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    scope        TEXT NOT NULL CHECK (scope IN ('study', 'insights')),
    scope_id     UUID,            -- study_id when scope='study'; NULL for 'insights'
    payload_hash TEXT NOT NULL,
    model        TEXT NOT NULL,
    analysis     JSONB NOT NULL,  -- {summary, findings[], risks[], suggested_experiments[], truncated}
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS insight_analyses_scope_idx
    ON public.insight_analyses (user_id, scope, scope_id, created_at DESC);

ALTER TABLE public.insight_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS insight_analyses_user_isolation ON public.insight_analyses;
CREATE POLICY insight_analyses_user_isolation ON public.insight_analyses
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS insight_analyses_service_role_all ON public.insight_analyses;
CREATE POLICY insight_analyses_service_role_all ON public.insight_analyses
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.insight_settings (
    user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    claude_enabled  BOOLEAN NOT NULL DEFAULT true,
    disabled_reason TEXT CHECK (disabled_reason IN ('billing', 'manual')),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.insight_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS insight_settings_user_isolation ON public.insight_settings;
CREATE POLICY insight_settings_user_isolation ON public.insight_settings
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS insight_settings_service_role_all ON public.insight_settings;
CREATE POLICY insight_settings_service_role_all ON public.insight_settings
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
