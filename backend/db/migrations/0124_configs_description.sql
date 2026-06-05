-- 0124_configs_description.sql
-- Feature 017: durable provenance for configs (e.g. "Drafted from Claude
-- analysis <id> · experiment <n>: <hypothesis>"). Nullable; existing rows
-- unaffected; RLS unchanged (0002 policies cover the new column).
ALTER TABLE public.configs ADD COLUMN IF NOT EXISTS description TEXT;
