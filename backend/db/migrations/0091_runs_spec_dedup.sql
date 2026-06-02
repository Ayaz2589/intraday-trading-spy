-- 0091_runs_spec_dedup.sql
-- Deduplicate identical backtests.
--
-- A run's "spec" (strategy + config params + symbol + range) is hashed into
-- spec_hash at request time; combined with data_fingerprint (a hash of the
-- bars), it uniquely identifies a *finished* run. start_backtest short-circuits
-- to an existing finished run for completed ranges; this index is the race-safe
-- backstop so two finished runs can never share the same spec + data.

ALTER TABLE public.runs ADD COLUMN IF NOT EXISTS spec_hash TEXT;

-- Partial + spec_hash-not-null so:
--   * queued/failed placeholders (data_fingerprint='pending') don't collide,
--   * legacy finished runs predating this column are exempt.
CREATE UNIQUE INDEX IF NOT EXISTS runs_spec_dedup_idx
  ON public.runs (user_id, spec_hash, data_fingerprint)
  WHERE status = 'finished' AND spec_hash IS NOT NULL;
