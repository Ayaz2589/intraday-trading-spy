"""Pydantic model tests: StrategyRow, ConfigRow, ConfigParams (T024).

These are unit-level tests — they validate Pydantic behavior without any
Supabase connection. Run as part of the default `pytest` suite.
"""

from __future__ import annotations

from uuid import uuid4

import pytest


def test_strategy_row_accepts_canonical_v1_values():
    from intraday_trade_spy.storage.models import StrategyRow

    row = StrategyRow(
        id=uuid4(),
        key="vwap_pullback_long",
        display_name="VWAP Pullback (Long)",
        description="...",
        symbol="SPY",
        direction="LONG",
        kind="rule_based",
        enabled=True,
    )
    assert row.symbol == "SPY"


def test_strategy_row_rejects_non_spy_symbol():
    """Constitution I."""
    from intraday_trade_spy.storage.models import StrategyRow

    with pytest.raises(ValueError):
        StrategyRow(
            id=uuid4(),
            key="qqq_test",
            display_name="QQQ",
            description="...",
            symbol="QQQ",
            direction="LONG",
            kind="rule_based",
            enabled=True,
        )


def test_strategy_row_rejects_short_direction():
    """Constitution II."""
    from intraday_trade_spy.storage.models import StrategyRow

    with pytest.raises(ValueError):
        StrategyRow(
            id=uuid4(),
            key="vwap_pullback_short",
            display_name="VWAP Pullback (Short)",
            description="...",
            symbol="SPY",
            direction="SHORT",
            kind="rule_based",
            enabled=True,
        )


def test_strategy_row_rejects_ml_kind():
    """Constitution II: rule-based only in v1."""
    from intraday_trade_spy.storage.models import StrategyRow

    with pytest.raises(ValueError):
        StrategyRow(
            id=uuid4(),
            key="ml_predictor",
            display_name="ML",
            description="...",
            symbol="SPY",
            direction="LONG",
            kind="ml",
            enabled=True,
        )


def test_config_params_accepts_typical_params():
    from intraday_trade_spy.storage.models import ConfigParams

    params = ConfigParams(
        max_risk_per_trade=0.01,
        max_daily_loss=0.02,
        max_trades_per_day=3,
        max_consecutive_losses=2,
        cooldown_after_loss_minutes=15,
        no_new_trades_cutoff="15:30",
        force_flat_time="15:55",
        opening_range_minutes=15,
        position_value_cap=50_000.0,
    )
    assert params.max_risk_per_trade == 0.01


def test_config_row_rejects_live_auto_enabled_true():
    """Constitution V: live_auto_enabled must be False in v1."""
    from intraday_trade_spy.storage.models import ConfigRow, ConfigParams

    params = ConfigParams(
        max_risk_per_trade=0.01,
        max_daily_loss=0.02,
        max_trades_per_day=3,
        max_consecutive_losses=2,
        cooldown_after_loss_minutes=15,
        no_new_trades_cutoff="15:30",
        force_flat_time="15:55",
        opening_range_minutes=15,
        position_value_cap=50_000.0,
    )
    with pytest.raises(ValueError):
        ConfigRow(
            id=uuid4(),
            user_id=uuid4(),
            strategy_id=uuid4(),
            name="bad",
            mode="backtest",
            live_auto_enabled=True,
            timeframe="5m",
            params=params,
        )


def test_config_row_rejects_live_mode():
    """Constitution V: mode is backtest or paper only."""
    from intraday_trade_spy.storage.models import ConfigRow, ConfigParams

    params = ConfigParams(
        max_risk_per_trade=0.01,
        max_daily_loss=0.02,
        max_trades_per_day=3,
        max_consecutive_losses=2,
        cooldown_after_loss_minutes=15,
        no_new_trades_cutoff="15:30",
        force_flat_time="15:55",
        opening_range_minutes=15,
        position_value_cap=50_000.0,
    )
    with pytest.raises(ValueError):
        ConfigRow(
            id=uuid4(),
            user_id=uuid4(),
            strategy_id=uuid4(),
            name="bad",
            mode="live",
            live_auto_enabled=False,
            timeframe="5m",
            params=params,
        )
