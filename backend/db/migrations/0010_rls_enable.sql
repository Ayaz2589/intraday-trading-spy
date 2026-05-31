-- 0010_rls_enable.sql
-- Enable Row Level Security on every table. See data-model.md and
-- contracts/schema-migrations.md for the RLS matrix.

ALTER TABLE public.strategies     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bars           ENABLE ROW LEVEL SECURITY;
