-- 0126_research_campaigns.sql — Feature 019 (automated strategy research)
--
-- 1) research_campaigns: one row per campaign; cycles live as a JSONB array
--    on the row (single-writer BackgroundTask owns it; the API only flips
--    cancel_requested). The partial unique index enforces the one-active-
--    campaign rule at the database, not just the router.
-- 2) recommendation_trials gains campaign provenance (FR-010): campaign_id
--    nulls if the campaign row is ever deleted, while cycle/family keep the
--    audit trail. `family` (sorted comma-joined knob paths changed vs the
--    campaign's starting config) keys the tightened-bar count k; pre-019
--    rows stay NULL and never match a family key.

CREATE TABLE IF NOT EXISTS public.research_campaigns (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    strategy_id          UUID NOT NULL REFERENCES public.strategies(id),
    seq                  INTEGER NOT NULL,
    starting_config_id   UUID REFERENCES public.configs(id) ON DELETE SET NULL,
    starting_config_name TEXT NOT NULL,
    budget               INTEGER NOT NULL CHECK (budget >= 0),
    status               TEXT NOT NULL CHECK (status IN ('running', 'halted', 'failed')),
    verdict              TEXT CHECK (verdict IN (
                             'ready_for_lockbox', 'stop_tuning',
                             'budget_exhausted', 'cancelled', 'failed')),
    verdict_detail       JSONB,
    cancel_requested     BOOLEAN NOT NULL DEFAULT false,
    thresholds           JSONB NOT NULL,
    cycles               JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, seq)
);

CREATE INDEX IF NOT EXISTS research_campaigns_user_recent_idx
    ON public.research_campaigns (user_id, created_at DESC);

-- One running campaign per operator, enforced by the database.
CREATE UNIQUE INDEX IF NOT EXISTS research_campaigns_one_running_idx
    ON public.research_campaigns (user_id) WHERE status = 'running';

ALTER TABLE public.research_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS research_campaigns_select_own ON public.research_campaigns;
CREATE POLICY research_campaigns_select_own ON public.research_campaigns
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS research_campaigns_insert_own ON public.research_campaigns;
CREATE POLICY research_campaigns_insert_own ON public.research_campaigns
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS research_campaigns_update_own ON public.research_campaigns;
CREATE POLICY research_campaigns_update_own ON public.research_campaigns
    FOR UPDATE USING (auth.uid() = user_id);

-- Campaign provenance on the trial ledger (FR-010).
ALTER TABLE public.recommendation_trials
    ADD COLUMN IF NOT EXISTS campaign_id UUID
        REFERENCES public.research_campaigns(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cycle INTEGER,
    ADD COLUMN IF NOT EXISTS family TEXT;

-- The tightened-bar count k reads per (user, strategy, family).
CREATE INDEX IF NOT EXISTS recommendation_trials_family_count_idx
    ON public.recommendation_trials (user_id, strategy_id, family, created_at DESC);
