-- 0013_rls_policies_bars.sql
-- Shared bars cache: any authenticated user can SELECT; only service role mutates.

DROP POLICY IF EXISTS bars_select_authenticated ON public.bars;
CREATE POLICY bars_select_authenticated ON public.bars
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS bars_service_role_all ON public.bars;
CREATE POLICY bars_service_role_all ON public.bars
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
