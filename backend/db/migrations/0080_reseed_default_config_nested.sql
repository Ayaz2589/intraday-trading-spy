-- 0080_reseed_default_config_nested.sql
-- Reshape configs.params from the flat seed shape (0070) to the nested shape
-- that matches backend/config/config.yaml (the canonical source of truth).
--
-- The frontend StrategyConfigCard and the Python config loader both expect
-- the nested shape: { risk: {...}, strategy: { vwap_pullback: {...} }, market: {...} }.
-- The flat shape silently rendered the card as all "—".
--
-- This migration:
--   1. Rewrites the seed function so new users get the nested shape.
--   2. Overwrites existing 'default' configs that still have the flat shape.
--      A config is "flat" if its params lacks the `risk` key.
--
-- Safe to re-run.

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
            "risk": {
                "account_value": 25000.0,
                "max_risk_per_trade_pct": 0.1,
                "max_daily_loss_pct": 2.0,
                "max_trades_per_day": 3,
                "max_consecutive_losses": 2,
                "cooldown_after_loss_minutes": 30,
                "max_position_value_pct": 100.0,
                "require_stop_loss": true,
                "require_take_profit": true,
                "allow_overnight_positions": false
            },
            "strategy": {
                "enabled_setup": "vwap_pullback_long",
                "opening_range": { "minutes": 15 },
                "vwap_pullback": {
                    "min_minutes_after_open": 15,
                    "max_distance_from_vwap_pct": 0.25,
                    "confirmation": {
                        "require_close_above_prior_bar_high": true,
                        "require_close_above_vwap": true
                    },
                    "stop": { "type": "below_pullback_low", "buffer_pct": 0.05 },
                    "target": { "risk_reward": 2.0 }
                }
            },
            "market": {
                "symbol": "SPY",
                "session_start": "09:30:00",
                "session_end": "16:00:00",
                "no_new_trades_after": "15:30:00",
                "force_flat_time": "15:55:00"
            }
        }'::jsonb
    )
    ON CONFLICT (user_id, name) DO NOTHING;
END;
$$;

-- Backfill: rewrite any 'default' config that still has the flat shape.
UPDATE public.configs
   SET params = '{
        "risk": {
            "account_value": 25000.0,
            "max_risk_per_trade_pct": 0.1,
            "max_daily_loss_pct": 2.0,
            "max_trades_per_day": 3,
            "max_consecutive_losses": 2,
            "cooldown_after_loss_minutes": 30,
            "max_position_value_pct": 100.0,
            "require_stop_loss": true,
            "require_take_profit": true,
            "allow_overnight_positions": false
        },
        "strategy": {
            "enabled_setup": "vwap_pullback_long",
            "opening_range": { "minutes": 15 },
            "vwap_pullback": {
                "min_minutes_after_open": 15,
                "max_distance_from_vwap_pct": 0.25,
                "confirmation": {
                    "require_close_above_prior_bar_high": true,
                    "require_close_above_vwap": true
                },
                "stop": { "type": "below_pullback_low", "buffer_pct": 0.05 },
                "target": { "risk_reward": 2.0 }
            }
        },
        "market": {
            "symbol": "SPY",
            "session_start": "09:30:00",
            "session_end": "16:00:00",
            "no_new_trades_after": "15:30:00",
            "force_flat_time": "15:55:00"
        }
    }'::jsonb,
       updated_at = now()
 WHERE name = 'default'
   AND NOT (params ? 'risk');
