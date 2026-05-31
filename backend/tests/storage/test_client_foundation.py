"""Foundation tests for SupabaseStorageClient (T032).

Tests __init__, .from_env(), and .health_check() — without requiring a live
Supabase instance. Network behavior is exercised via unittest.mock.

The full push/upsert tests live in test_client_push.py (US1).
"""

from __future__ import annotations

import os
from unittest import mock
from uuid import uuid4

import pytest


@pytest.fixture()
def fake_env(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-service-role-key")
    monkeypatch.setenv("SUPABASE_USER_ID", str(uuid4()))


def test_from_env_constructs_when_all_set(fake_env):
    from intraday_trade_spy.storage import SupabaseStorageClient

    with mock.patch("intraday_trade_spy.storage.client.create_client") as create:
        create.return_value = mock.MagicMock()
        client = SupabaseStorageClient.from_env()
        assert client.user_id == os.environ["SUPABASE_USER_ID"]


def test_from_env_raises_when_url_missing(monkeypatch):
    from intraday_trade_spy.storage import AuthError, SupabaseStorageClient

    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake")
    monkeypatch.setenv("SUPABASE_USER_ID", str(uuid4()))

    with pytest.raises(AuthError) as exc_info:
        SupabaseStorageClient.from_env()
    assert "SUPABASE_URL" in str(exc_info.value)


def test_from_env_raises_when_service_role_missing(monkeypatch):
    from intraday_trade_spy.storage import AuthError, SupabaseStorageClient

    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.setenv("SUPABASE_USER_ID", str(uuid4()))

    with pytest.raises(AuthError) as exc_info:
        SupabaseStorageClient.from_env()
    assert "SUPABASE_SERVICE_ROLE_KEY" in str(exc_info.value)


def test_from_env_raises_when_user_id_missing(monkeypatch):
    from intraday_trade_spy.storage import AuthError, SupabaseStorageClient

    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake")
    monkeypatch.delenv("SUPABASE_USER_ID", raising=False)

    with pytest.raises(AuthError) as exc_info:
        SupabaseStorageClient.from_env()
    assert "SUPABASE_USER_ID" in str(exc_info.value)


def test_from_env_lists_all_missing_in_one_error(monkeypatch):
    from intraday_trade_spy.storage import AuthError, SupabaseStorageClient

    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_USER_ID", raising=False)

    with pytest.raises(AuthError) as exc_info:
        SupabaseStorageClient.from_env()
    msg = str(exc_info.value)
    assert "SUPABASE_URL" in msg
    assert "SUPABASE_SERVICE_ROLE_KEY" in msg
    assert "SUPABASE_USER_ID" in msg


def test_health_check_passes_on_200():
    from intraday_trade_spy.storage import SupabaseStorageClient

    with mock.patch("intraday_trade_spy.storage.client.create_client") as create:
        fake_client = mock.MagicMock()
        fake_table = mock.MagicMock()
        fake_client.table.return_value = fake_table
        fake_table.select.return_value = fake_table
        fake_table.limit.return_value = fake_table
        fake_table.execute.return_value = mock.MagicMock(data=[{"key": "vwap_pullback_long"}])
        create.return_value = fake_client

        client = SupabaseStorageClient(
            url="https://test.supabase.co",
            service_role_key="fake",
            user_id=str(uuid4()),
        )
        # No raise = success
        client.health_check()


def test_health_check_raises_on_empty_result():
    from intraday_trade_spy.storage import CloudPushError, SupabaseStorageClient

    with mock.patch("intraday_trade_spy.storage.client.create_client") as create:
        fake_client = mock.MagicMock()
        fake_table = mock.MagicMock()
        fake_client.table.return_value = fake_table
        fake_table.select.return_value = fake_table
        fake_table.limit.return_value = fake_table
        # Empty response = strategies table not seeded or unreachable
        fake_table.execute.return_value = mock.MagicMock(data=[])
        create.return_value = fake_client

        client = SupabaseStorageClient(
            url="https://test.supabase.co",
            service_role_key="fake",
            user_id=str(uuid4()),
        )
        with pytest.raises(CloudPushError):
            client.health_check()


def test_init_rejects_invalid_user_id():
    from intraday_trade_spy.storage import SupabaseStorageClient

    with pytest.raises(ValueError):
        SupabaseStorageClient(
            url="https://test.supabase.co",
            service_role_key="fake",
            user_id="not-a-uuid",
        )
