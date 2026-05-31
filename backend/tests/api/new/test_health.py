"""GET /healthz tests (T034)."""

from __future__ import annotations

import time
from unittest import mock

import pytest


pytestmark = pytest.mark.api


def test_healthz_returns_200_when_db_reachable(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-service-role-key")

    with mock.patch("intraday_trade_spy.storage.client.create_client") as create:
        # health_check passes (returns row)
        fake_client = mock.MagicMock()
        fake_table = mock.MagicMock()
        fake_client.table.return_value = fake_table
        fake_table.select.return_value = fake_table
        fake_table.limit.return_value = fake_table
        fake_table.execute.return_value = mock.MagicMock(data=[{"key": "vwap_pullback_long"}])
        create.return_value = fake_client

        from fastapi.testclient import TestClient
        from intraday_trade_spy.api.app import create_app

        app = create_app()
        with TestClient(app) as client:
            r = client.get("/healthz")
            assert r.status_code == 200
            assert r.json() == {"status": "ok", "db": "ok"}


def test_healthz_returns_503_when_db_unreachable(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-service-role-key")

    with mock.patch("intraday_trade_spy.storage.client.create_client") as create:
        fake_client = mock.MagicMock()
        fake_table = mock.MagicMock()
        fake_client.table.return_value = fake_table
        fake_table.select.return_value = fake_table
        fake_table.limit.return_value = fake_table
        fake_table.execute.side_effect = Exception("connection refused")
        create.return_value = fake_client

        from fastapi.testclient import TestClient
        from intraday_trade_spy.api.app import create_app

        app = create_app()
        with TestClient(app) as client:
            r = client.get("/healthz")
            assert r.status_code == 503
            assert r.json()["db"] == "unreachable"


def test_healthz_unauthenticated(monkeypatch):
    """No Authorization header required."""
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake")

    with mock.patch("intraday_trade_spy.storage.client.create_client") as create:
        fake_client = mock.MagicMock()
        fake_client.table().select().limit().execute.return_value = mock.MagicMock(
            data=[{"key": "vwap_pullback_long"}]
        )
        create.return_value = fake_client

        from fastapi.testclient import TestClient
        from intraday_trade_spy.api.app import create_app

        app = create_app()
        with TestClient(app) as client:
            r = client.get("/healthz")  # no Authorization header
            assert r.status_code == 200


def test_healthz_under_200ms(monkeypatch):
    """SC-005 — health check returns under 200ms when DB is reachable."""
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake")

    with mock.patch("intraday_trade_spy.storage.client.create_client") as create:
        fake_client = mock.MagicMock()
        fake_client.table().select().limit().execute.return_value = mock.MagicMock(
            data=[{"key": "vwap_pullback_long"}]
        )
        create.return_value = fake_client

        from fastapi.testclient import TestClient
        from intraday_trade_spy.api.app import create_app

        app = create_app()
        with TestClient(app) as client:
            start = time.perf_counter()
            r = client.get("/healthz")
            elapsed_ms = (time.perf_counter() - start) * 1000
            assert r.status_code == 200
            assert elapsed_ms < 200, f"health check took {elapsed_ms:.1f}ms (budget 200ms)"
