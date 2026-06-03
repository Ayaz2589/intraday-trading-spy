-- 0093_bars_bar_start_index.sql
-- Feature 009 (Phase 0 data foundation).
-- Range reads over bars filter by bar_start (gte/lt in list_bars). With a
-- multi-year cache (~100k rows) those reads must not full-scan. Add a B-tree
-- index on bar_start. Idempotent.
CREATE INDEX IF NOT EXISTS bars_bar_start_idx ON public.bars (bar_start);
