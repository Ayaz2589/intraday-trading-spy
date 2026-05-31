-- 0051_runs_status.sql
-- Adds the run-lifecycle state machine to runs: status, status_updated_at,
-- failure_reason. See data-model.md §1.
-- Existing rows are backfilled to status='finished' since they were written
-- by the CLI push path (Feature 005) which only writes completed runs.

ALTER TABLE public.runs
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'queued';

ALTER TABLE public.runs
    DROP CONSTRAINT IF EXISTS runs_status_check;

ALTER TABLE public.runs
    ADD CONSTRAINT runs_status_check CHECK (status IN ('queued','running','finished','failed'));

ALTER TABLE public.runs
    ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.runs
    ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- Backfill any pre-Feature-006 rows: they were inserted via push_run() and
-- represent completed work.
UPDATE public.runs SET status = 'finished'
 WHERE status = 'queued' AND finished_at IS NOT NULL;

-- Index for the startup-sweep query (find stale running rows)
CREATE INDEX IF NOT EXISTS runs_status_status_updated_at_idx
    ON public.runs (status, status_updated_at);
