-- 0122_workable_default_seed.sql
-- Feature 012: ship a SPY-workable default so a fresh config actually trades.
-- The old seed used max_position_value_pct=100, which rejects the risk-based
-- intraday position as soon as risk is raised (the 0-trade wall). Reseed at 400
-- (4x intraday buying power) and bump existing defaults still on 100. The
-- per-trade-risk and daily-loss vetoes are unchanged. Idempotent.

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

    INSERT INTO public.configs (user_id, strategy_id, name, mode, params, is_active)
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
                "max_position_value_pct": 400.0,
                "require_stop_loss": true,
                "require_take_profit": true,
                "allow_overnight_positions": false
            },
            "strategy": {
                "enabled_setup": "vwap_pullback_long",
                "opening_range": { "minutes": 15 },
                "vwap_pullback": {
                    "max_distance_from_vwap_pct": 0.25,
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
        true
    )
    ON CONFLICT (user_id, name) DO NOTHING;
END;
$$;

-- Bump existing configs still on the 0-trade cap=100 to the workable 400.
-- Only touches the position-value cap; leaves all other knobs intact.
UPDATE public.configs
   SET params = jsonb_set(params, '{risk,max_position_value_pct}', '400'::jsonb),
       updated_at = now()
 WHERE params ? 'risk'
   AND (params->'risk'->>'max_position_value_pct')::numeric = 100;
