"""GET /api/runs/* tests (T036-T040 consolidated)."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest


pytestmark = pytest.mark.api


def _make_run_row(run_id, user_id):
    return {
        "id": str(run_id),
        "user_id": str(user_id),
        "config_id": str(uuid4()),
        "strategy_id": str(uuid4()),
        "started_at": datetime.now(timezone.utc).isoformat(),
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "status": "finished",
        "range_start": "2026-05-26",
        "range_end": "2026-05-28",
        "bar_count": 234,
        "summary": {
            "pnl": "0.0",
            "win_rate": 0.33,
            "sharpe": 0.0,
            "max_drawdown": "-2.0",
            "total_trades": 3,
            "total_signals": 120,
            "rejected_signals": 117,
        },
        "data_fingerprint": "fp-abc",
        "app_version": "test",
    }


def test_list_runs_returns_empty(unit_client, stub_storage_client):
    class _Page:
        runs = []
        next_cursor = None
    stub_storage_client.list_runs.return_value = _Page()
    r = unit_client.get("/api/runs")
    assert r.status_code == 200
    body = r.json()
    assert body["runs"] == []
    assert body["next_cursor"] is None


def test_list_runs_returns_user_data(unit_client, stub_storage_client):
    from uuid import UUID
    TEST_USER_ID = UUID("11111111-1111-1111-1111-111111111111")

    class _Page:
        next_cursor = None
    page = _Page()
    page.runs = [_make_run_row(uuid4(), TEST_USER_ID)]
    stub_storage_client.list_runs.return_value = page

    r = unit_client.get("/api/runs")
    assert r.status_code == 200
    body = r.json()
    assert len(body["runs"]) == 1
    assert body["runs"][0]["bar_count"] == 234


def test_get_run_404_when_missing(unit_client, stub_storage_client):
    stub_storage_client.get_run.return_value = None
    r = unit_client.get(f"/api/runs/{uuid4()}")
    assert r.status_code == 404
    assert r.json()["detail"]["error"] == "not_found"


def test_get_run_status(unit_client, stub_storage_client):
    stub_storage_client.get_run_status.return_value = {
        "status": "running",
        "status_updated_at": datetime.now(timezone.utc).isoformat(),
        "failure_reason": None,
    }
    r = unit_client.get(f"/api/runs/{uuid4()}/status")
    assert r.status_code == 200
    assert r.json()["status"] == "running"


def test_get_run_status_failed_includes_reason(unit_client, stub_storage_client):
    stub_storage_client.get_run_status.return_value = {
        "status": "failed",
        "status_updated_at": datetime.now(timezone.utc).isoformat(),
        "failure_reason": "engine crashed",
    }
    r = unit_client.get(f"/api/runs/{uuid4()}/status")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "failed"
    assert body["failure_reason"] == "engine crashed"


def test_list_trades_404_when_run_not_found(unit_client, stub_storage_client):
    stub_storage_client.get_run.return_value = None
    r = unit_client.get(f"/api/runs/{uuid4()}/trades")
    assert r.status_code == 404


def test_list_trades_uses_cursor_pagination(unit_client, stub_storage_client):
    from uuid import UUID
    TEST_USER_ID = UUID("11111111-1111-1111-1111-111111111111")

    stub_storage_client.get_run.return_value = _make_run_row(uuid4(), TEST_USER_ID)

    class _Page:
        trades = []
        next_cursor = None
    stub_storage_client.list_trades.return_value = _Page()

    r = unit_client.get(f"/api/runs/{uuid4()}/trades?limit=5")
    assert r.status_code == 200
    assert r.json()["next_cursor"] is None


def test_list_signals_filters_by_executed(unit_client, stub_storage_client):
    from uuid import UUID
    TEST_USER_ID = UUID("11111111-1111-1111-1111-111111111111")

    stub_storage_client.get_run.return_value = _make_run_row(uuid4(), TEST_USER_ID)

    class _Page:
        signals = []
        next_cursor = None
    stub_storage_client.list_signals.return_value = _Page()

    r = unit_client.get(f"/api/runs/{uuid4()}/signals?executed=false")
    assert r.status_code == 200
    stub_storage_client.list_signals.assert_called()
    # Check the executed=False kwarg was forwarded
    called_kwargs = stub_storage_client.list_signals.call_args.kwargs
    assert called_kwargs["executed"] is False


def test_list_journal_returns_events(unit_client, stub_storage_client):
    from uuid import UUID
    TEST_USER_ID = UUID("11111111-1111-1111-1111-111111111111")

    stub_storage_client.get_run.return_value = _make_run_row(uuid4(), TEST_USER_ID)

    class _Page:
        events = []
        next_cursor = None
    stub_storage_client.list_journal.return_value = _Page()

    r = unit_client.get(f"/api/runs/{uuid4()}/journal")
    assert r.status_code == 200


def test_invalid_cursor_returns_400(unit_client):
    r = unit_client.get("/api/runs?cursor=not-base64!!!")
    assert r.status_code == 400
    assert r.json()["detail"]["error"] == "invalid_cursor"
