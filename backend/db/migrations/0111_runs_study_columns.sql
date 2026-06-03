-- 0111_runs_study_columns.sql
-- Feature 011 (Phase 2 — validation engine).
-- Tag a run as a child of a validation study. All three columns are nullable so
-- existing standalone runs are unaffected (study_id NULL = standalone).
--
-- segment allows NULL (resolves analyze finding I3): a child run over a combined
-- train+validation range isn't cleanly one segment, so it is left NULL. A
-- lockbox one-shot run is tagged segment='lockbox' with study_id NULL (it owns
-- no study row — see 0110 / I1).

ALTER TABLE public.runs
    ADD COLUMN IF NOT EXISTS study_id UUID
        REFERENCES public.validation_studies(id) ON DELETE CASCADE;

ALTER TABLE public.runs
    ADD COLUMN IF NOT EXISTS segment TEXT
        CHECK (segment IS NULL OR segment IN ('train','validation','lockbox'));

ALTER TABLE public.runs
    ADD COLUMN IF NOT EXISTS window_index INTEGER
        CHECK (window_index IS NULL OR window_index >= 0);

-- Study aggregation scans a study's children in window order.
CREATE INDEX IF NOT EXISTS runs_study_window_idx
    ON public.runs (study_id, window_index)
    WHERE study_id IS NOT NULL;
