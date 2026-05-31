"""SupabaseStorageClient.get_strategy_by_key tests (T038)."""

from __future__ import annotations

from unittest import mock
from uuid import uuid4

import pytest


def test_get_strategy_by_key_returns_strategy_row():
    from intraday_trade_spy.storage import SupabaseStorageClient

    with mock.patch("intraday_trade_spy.storage.client.create_client") as create:
        fake_client = mock.MagicMock()
        fake_table = mock.MagicMock()
        fake_client.table.return_value = fake_table
        fake_table.select.return_value = fake_table
        fake_table.eq.return_value = fake_table
        fake_table.limit.return_value = fake_table
        fake_table.execute.return_value = mock.MagicMock(
            data=[
                {
                    "id": str(uuid4()),
                    "key": "vwap_pullback_long",
                    "display_name": "VWAP Pullback (Long)",
                    "description": "...",
                    "symbol": "SPY",
                    "direction": "LONG",
                    "kind": "rule_based",
                    "enabled": True,
                }
            ]
        )
        create.return_value = fake_client

        client = SupabaseStorageClient(
            url="https://test.supabase.co",
            service_role_key="fake",
            user_id=str(uuid4()),
        )
        row = client.get_strategy_by_key("vwap_pullback_long")
        assert row.key == "vwap_pullback_long"
        assert row.symbol == "SPY"


def test_get_strategy_by_key_raises_for_unknown_key():
    from intraday_trade_spy.storage import SchemaError, SupabaseStorageClient

    with mock.patch("intraday_trade_spy.storage.client.create_client") as create:
        fake_client = mock.MagicMock()
        fake_table = mock.MagicMock()
        fake_client.table.return_value = fake_table
        fake_table.select.return_value = fake_table
        fake_table.eq.return_value = fake_table
        fake_table.limit.return_value = fake_table
        fake_table.execute.return_value = mock.MagicMock(data=[])
        create.return_value = fake_client

        client = SupabaseStorageClient(
            url="https://test.supabase.co",
            service_role_key="fake",
            user_id=str(uuid4()),
        )
        with pytest.raises(SchemaError):
            client.get_strategy_by_key("nonexistent_strategy")
