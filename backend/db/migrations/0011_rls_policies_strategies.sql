-- 0011_rls_policies_strategies.sql
-- Registry table: read-all-authenticated, mutate-service-role-only.

DROP POLICY IF EXISTS strategies_select_all ON public.strategies;
CREATE POLICY strategies_select_all ON public.strategies
    FOR SELECT
    TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS strategies_service_role_all ON public.strategies;
CREATE POLICY strategies_service_role_all ON public.strategies
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
