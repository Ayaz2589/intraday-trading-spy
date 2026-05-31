-- 0070_seed_default_config_on_signup.sql
-- Feature 007 / FR-021 / clarification Q4.
-- When a new auth.users row is inserted, automatically create a starter
-- "default" config for them so they can run their first backtest with zero
-- out-of-band setup.
--
-- See specs/007-frontend-auth-api-migration/data-model.md §2.
--
-- Both functions are SECURITY DEFINER so they can INSERT into public.configs
-- regardless of the caller's RLS context. The functions' owner (typically
-- postgres / supabase_admin) MUST have INSERT privileges on public.configs.
-- Verify after migration: `\df+ seed_default_config_for_user` (owner),
-- `\dp public.configs` (privileges).
--
-- Two-function pattern: the parametric `seed_default_config_for_user(uid)`
-- contains the logic and is callable for backfill / tests. The trigger
-- wrapper `seed_default_config_trigger_fn()` is parameterless (as Postgres
-- requires for triggers) and just calls the parametric function with NEW.id.

CREATE OR REPLACE FUNCTION public.seed_default_config_for_user(uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    strategy_id_v UUID;
BEGIN
    SELECT id INTO strategy_id_v
      FROM public.strategies
     WHERE key = 'vwap_pullback_long'
     LIMIT 1;

    IF strategy_id_v IS NULL THEN
        RAISE EXCEPTION 'seed_default_config_for_user: vwap_pullback_long not in registry';
    END IF;

    INSERT INTO public.configs (user_id, strategy_id, name, mode, params)
    VALUES (
        uid,
        strategy_id_v,
        'default',
        'backtest',
        '{
            "max_risk_per_trade": 0.01,
            "max_daily_loss": 0.02,
            "max_trades_per_day": 3,
            "max_consecutive_losses": 2,
            "cooldown_after_loss_minutes": 15,
            "no_new_trades_cutoff": "15:30",
            "force_flat_time": "15:55",
            "opening_range_minutes": 15,
            "position_value_cap": 50000.0
        }'::jsonb
    )
    ON CONFLICT (user_id, name) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_default_config_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.seed_default_config_for_user(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_seed_config ON auth.users;

CREATE TRIGGER on_auth_user_created_seed_config
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.seed_default_config_trigger_fn();
