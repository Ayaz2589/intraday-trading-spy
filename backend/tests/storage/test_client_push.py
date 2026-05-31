"""SupabaseStorageClient.push_run tests (T036).

Unit-level tests using mock; full round-trip lives in test_push_round_trip.py.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from unittest import mock
from uuid import uuid4

import pytest


def _valid_payload(user_id):
    from intraday_trade_spy.storage.models import (
        PushRunPayload,
        RunRow,
        RunSummary,
    )

    return PushRunPayload(
        run=RunRow(
            id=uuid4(),
            user_id=user_id,
            config_id=uuid4(),
            strategy_id=uuid4(),
            started_at=datetime.now(timezone.utc),
            finished_at=datetime.now(timezone.utc),
            range_start=date(2026, 1, 1),
            range_end=date(2026, 1, 2),
            bar_count=100,
            summary=RunSummary(
                pnl=Decimal("0"), win_rate=0.0, sharpe=0.0,
                max_drawdown=Decimal("0"), total_trades=0,
                total_signals=0, rejected_signals=0,
            ),
            data_fingerprint="fp",
            app_version="test",
        ),
        trades=[],
        signals=[],
        journal_events=[],
    )


def test_push_run_raises_authproblem_on_user_id_mismatch():
    from intraday_trade_spy.storage import AuthError, SupabaseStorageClient

    client_user_id = uuid4()
    payload_user_id = uuid4()  # different!

    with mock.patch("intraday_trade_spy.storage.client.create_client"):
        client = SupabaseStorageClient(
            url="https://test.supabase.co",
            service_role_key="fake",
            user_id=str(client_user_id),
        )
        payload = _valid_payload(payload_user_id)
        with pytest.raises(AuthError):
            client.push_run(payload)


def test_push_run_calls_rpc_with_payload():
    from intraday_trade_spy.storage import SupabaseStorageClient

    user_id = uuid4()
    with mock.patch("intraday_trade_spy.storage.client.create_client") as create:
        fake_client = mock.MagicMock()
        fake_rpc = mock.MagicMock()
        fake_client.rpc.return_value = fake_rpc
        fake_rpc.execute.return_value = mock.MagicMock(data=str(uuid4()))
        create.return_value = fake_client

        client = SupabaseStorageClient(
            url="https://test.supabase.co",
            service_role_key="fake",
            user_id=str(user_id),
        )
        payload = _valid_payload(user_id)
        result = client.push_run(payload)
        assert result == str(payload.run.id)
        fake_client.rpc.assert_called_once()
        assert fake_client.rpc.call_args[0][0] == "push_run"


def test_push_run_maps_auth_errors():
    from intraday_trade_spy.storage import AuthError, SupabaseStorageClient

    user_id = uuid4()
    with mock.patch("intraday_trade_spy.storage.client.create_client") as create:
        fake_client = mock.MagicMock()
        fake_client.rpc.return_value.execute.side_effect = Exception("401 Unauthorized")
        create.return_value = fake_client

        client = SupabaseStorageClient(
            url="https://test.supabase.co",
            service_role_key="fake",
            user_id=str(user_id),
        )
        with pytest.raises(AuthError):
            client.push_run(_valid_payload(user_id))


def test_push_run_maps_schema_errors():
    from intraday_trade_spy.storage import SchemaError, SupabaseStorageClient

    user_id = uuid4()
    with mock.patch("intraday_trade_spy.storage.client.create_client") as create:
        fake_client = mock.MagicMock()
        fake_client.rpc.return_value.execute.side_effect = Exception(
            "violates check constraint"
        )
        create.return_value = fake_client

        client = SupabaseStorageClient(
            url="https://test.supabase.co",
            service_role_key="fake",
            user_id=str(user_id),
        )
        with pytest.raises(SchemaError):
            client.push_run(_valid_payload(user_id))
