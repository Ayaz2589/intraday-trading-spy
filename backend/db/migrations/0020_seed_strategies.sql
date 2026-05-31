-- 0020_seed_strategies.sql
-- Seed the strategy registry with the v1 strategy: vwap_pullback_long.
-- FR-010. Constitution I + II + Engineering constraints encoded via CHECKs in 0001.
-- Idempotent: ON CONFLICT DO NOTHING.

INSERT INTO public.strategies (key, display_name, description, symbol, direction, kind)
VALUES (
    'vwap_pullback_long',
    'VWAP Pullback (Long)',
    'After the opening range completes, a long signal is generated when SPY pulls back to its VWAP from above, with confirmation. Stop below VWAP, target at the opening-range high or a configured R-multiple.',
    'SPY',
    'LONG',
    'rule_based'
)
ON CONFLICT (key) DO NOTHING;
