"""SupabaseStorageClient.upsert_config tests (T037)."""

from __future__ import annotations

from unittest import mock
from uuid import uuid4

import pytest


def _params():
    from intraday_trade_spy.storage.models import ConfigParams

    return ConfigParams(
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


def test_upsert_config_rejects_user_id_mismatch():
    from intraday_trade_spy.storage import AuthError, SupabaseStorageClient
    from intraday_trade_spy.storage.models import ConfigRow

    client_user_id = uuid4()
    other_user_id = uuid4()

    with mock.patch("intraday_trade_spy.storage.client.create_client"):
        client = SupabaseStorageClient(
            url="https://test.supabase.co",
            service_role_key="fake",
            user_id=str(client_user_id),
        )
        config = ConfigRow(
            id=uuid4(),
            user_id=other_user_id,
            strategy_id=uuid4(),
            name="test",
            mode="backtest",
            params=_params(),
        )
        with pytest.raises(AuthError):
            client.upsert_config(config)


def test_upsert_config_pydantic_rejects_live_auto_enabled_true():
    """Pydantic catches this BEFORE the client's defensive check."""
    from intraday_trade_spy.storage.models import ConfigRow

    user_id = uuid4()
    with pytest.raises(ValueError):
        ConfigRow(
            id=uuid4(),
            user_id=user_id,
            strategy_id=uuid4(),
            name="bad",
            mode="backtest",
            live_auto_enabled=True,
            params=_params(),
        )
