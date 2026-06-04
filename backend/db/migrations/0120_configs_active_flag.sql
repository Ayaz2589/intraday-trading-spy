-- 0120_configs_active_flag.sql
-- Feature 012 (first-class config management).
-- A config can be the operator's designated "active" config — pre-selected
-- wherever a config is chosen (backtest / validation study / lockbox),
-- preserving today's no-explicit-pick flows. Exactly one active per user.

ALTER TABLE public.configs
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false;

-- DB-enforced invariant: at most one active config per user.
CREATE UNIQUE INDEX IF NOT EXISTS configs_one_active_per_user
    ON public.configs (user_id) WHERE is_active;

-- Backfill: give each user exactly one active config (their earliest, i.e. the
-- seeded 'default' in practice) if they don't already have one. Idempotent.
WITH ranked AS (
    SELECT id, user_id,
           row_number() OVER (PARTITION BY user_id ORDER BY created_at, id) AS rn
      FROM public.configs
)
UPDATE public.configs c
   SET is_active = true
  FROM ranked r
 WHERE c.id = r.id
   AND r.rn = 1
   AND NOT EXISTS (
        SELECT 1 FROM public.configs c2
         WHERE c2.user_id = c.user_id AND c2.is_active
   );
