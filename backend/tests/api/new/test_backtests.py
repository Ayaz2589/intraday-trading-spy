"""POST /api/backtests tests (T035)."""

from __future__ import annotations

from unittest import mock
from uuid import uuid4

import pytest


pytestmark = pytest.mark.api


def test_post_backtests_returns_202_with_run_id(unit_client, stub_storage_client):
    stub_storage_client.get_config_by_name.return_value = {
        "id": str(uuid4()),
        "strategy_id": str(uuid4()),
        "name": "default",
    }
    stub_storage_client.insert_queued_run.return_value = str(uuid4())

    r = unit_client.post("/api/backtests", json={"config_name": "default"})
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "queued"
    assert "run_id" in body


def test_post_backtests_rejects_body_with_symbol(unit_client, stub_storage_client):
    """Constitution I."""
    r = unit_client.post(
        "/api/backtests",
        json={"config_name": "default", "symbol": "QQQ"},
    )
    assert r.status_code == 422


def test_post_backtests_rejects_body_with_direction(unit_client):
    """Constitution II."""
    r = unit_client.post(
        "/api/backtests",
        json={"config_name": "default", "direction": "SHORT"},
    )
    assert r.status_code == 422


def test_post_backtests_rejects_body_with_live_auto_enabled(unit_client):
    """Constitution V."""
    r = unit_client.post(
        "/api/backtests",
        json={"config_name": "default", "live_auto_enabled": True},
    )
    assert r.status_code == 422


def test_post_backtests_404_on_unknown_config(unit_client, stub_storage_client):
    stub_storage_client.get_config_by_name.return_value = None
    r = unit_client.post("/api/backtests", json={"config_name": "nonexistent"})
    assert r.status_code == 404
    assert r.json()["detail"]["error"] == "config_not_found"


def test_post_backtests_429_on_cap_exceeded(unit_client, stub_storage_client):
    from intraday_trade_spy.api.lifecycle import _active_runs

    # Pre-populate the in-memory tracker to the cap
    fake_user = uuid4()
    _active_runs[fake_user] = {uuid4() for _ in range(5)}

    # Override auth_user_id with the fake_user for this test
    from intraday_trade_spy.api.deps import auth_user_id
    unit_client.app.dependency_overrides[auth_user_id] = lambda: fake_user

    stub_storage_client.get_config_by_name.return_value = {
        "id": str(uuid4()),
        "strategy_id": str(uuid4()),
        "name": "default",
    }

    r = unit_client.post("/api/backtests", json={"config_name": "default"})
    assert r.status_code == 429
    assert r.json()["detail"]["error"] == "concurrent_run_cap_exceeded"

    # cleanup
    _active_runs.pop(fake_user, None)


def test_post_backtests_401_without_auth():
    """No JWT in header → 401."""
    import os
    from unittest.mock import patch

    os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
    os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "fake")

    with patch("intraday_trade_spy.storage.client.create_client"):
        from fastapi.testclient import TestClient

        from intraday_trade_spy.api.app import create_app

        app = create_app()
        with TestClient(app) as client:
            r = client.post("/api/backtests", json={"config_name": "default"})
            assert r.status_code == 401
            assert r.json()["detail"]["error"] == "missing_or_invalid_token"


def test_post_backtests_rejects_missing_config_name(unit_client):
    r = unit_client.post("/api/backtests", json={})
    assert r.status_code == 422


def test_post_backtests_dedups_identical_completed_run(unit_client, stub_storage_client):
    """An identical, already-finished backtest over a COMPLETED range returns
    the existing run instead of creating a duplicate."""
    stub_storage_client.get_config_by_name.return_value = {
        "id": str(uuid4()),
        "strategy_id": str(uuid4()),
        "name": "default",
        "params": {},
    }
    existing_id = str(uuid4())
    stub_storage_client.find_finished_run_by_spec.return_value = existing_id

    r = unit_client.post(
        "/api/backtests",
        json={"config_name": "default", "start_date": "2020-01-02", "end_date": "2020-01-03"},
    )
    assert r.status_code == 202
    assert r.json()["run_id"] == existing_id
    stub_storage_client.insert_queued_run.assert_not_called()
