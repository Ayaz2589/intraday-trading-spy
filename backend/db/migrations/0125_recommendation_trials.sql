-- 0125_recommendation_trials.sql — Feature 018 (recommendation engine)
--
-- 1) The data-snooping trial ledger: one row per config created through the
--    draft flow (analyze A1 decision: ANY analysis-originated draft is a
--    trial — source 'claude' when the draft carries an analysis id,
--    'deterministic' when drafted from a deterministic candidate card).
--    config_id nulls on config deletion while config_name keeps the audit
--    trail (Principle VII; counts must survive deletion).
-- 2) Widen insight_analyses.scope for the new advisory scope 'recommend'
--    (scope_id = configs.id for that scope).

CREATE TABLE IF NOT EXISTS public.recommendation_trials (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    strategy_id UUID NOT NULL REFERENCES public.strategies(id),
    config_id   UUID REFERENCES public.configs(id) ON DELETE SET NULL,
    config_name TEXT NOT NULL,
    analysis_id UUID REFERENCES public.insight_analyses(id) ON DELETE SET NULL,
    source      TEXT NOT NULL CHECK (source IN ('claude', 'deterministic')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Family counts read newest-first per (user, strategy family).
CREATE INDEX IF NOT EXISTS recommendation_trials_family_idx
    ON public.recommendation_trials (user_id, strategy_id, created_at DESC);

-- RLS mirrors 0123 (user-owned rows; service role bypasses).
ALTER TABLE public.recommendation_trials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recommendation_trials_select_own ON public.recommendation_trials;
CREATE POLICY recommendation_trials_select_own ON public.recommendation_trials
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS recommendation_trials_insert_own ON public.recommendation_trials;
CREATE POLICY recommendation_trials_insert_own ON public.recommendation_trials
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- analyze U3: Postgres auto-named 0123's inline column CHECK as
-- insight_analyses_scope_check; IF EXISTS guards a divergent name (verify the
-- actual name via pg_constraint at apply time).
ALTER TABLE public.insight_analyses
    DROP CONSTRAINT IF EXISTS insight_analyses_scope_check;
ALTER TABLE public.insight_analyses
    ADD CONSTRAINT insight_analyses_scope_check
    CHECK (scope IN ('study', 'insights', 'recommend'));
