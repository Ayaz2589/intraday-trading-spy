-- 0012_rls_policies_user_scoped.sql
-- User-scoped tables: full CRUD restricted to (user_id = auth.uid()).
-- Service role policy bypasses RLS (used by the CLI in feature 005).

-- configs
DROP POLICY IF EXISTS configs_user_isolation ON public.configs;
CREATE POLICY configs_user_isolation ON public.configs
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS configs_service_role_all ON public.configs;
CREATE POLICY configs_service_role_all ON public.configs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- runs
DROP POLICY IF EXISTS runs_user_isolation ON public.runs;
CREATE POLICY runs_user_isolation ON public.runs
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS runs_service_role_all ON public.runs;
CREATE POLICY runs_service_role_all ON public.runs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- trades
DROP POLICY IF EXISTS trades_user_isolation ON public.trades;
CREATE POLICY trades_user_isolation ON public.trades
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS trades_service_role_all ON public.trades;
CREATE POLICY trades_service_role_all ON public.trades
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- signals
DROP POLICY IF EXISTS signals_user_isolation ON public.signals;
CREATE POLICY signals_user_isolation ON public.signals
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS signals_service_role_all ON public.signals;
CREATE POLICY signals_service_role_all ON public.signals
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- journal_events
DROP POLICY IF EXISTS journal_events_user_isolation ON public.journal_events;
CREATE POLICY journal_events_user_isolation ON public.journal_events
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS journal_events_service_role_all ON public.journal_events;
CREATE POLICY journal_events_service_role_all ON public.journal_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
