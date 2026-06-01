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


def test_list_bars_404_when_run_not_found(unit_client, stub_storage_client):
    stub_storage_client.get_run.return_value = None
    r = unit_client.get(f"/api/runs/{uuid4()}/bars")
    assert r.status_code == 404


def test_get_manifest_404_when_run_not_found(unit_client, stub_storage_client):
    stub_storage_client.get_run.return_value = None
    r = unit_client.get(f"/api/runs/{uuid4()}/manifest")
    assert r.status_code == 404


def test_get_manifest_returns_strategy_and_config(unit_client, stub_storage_client):
    from uuid import UUID
    TEST_USER_ID = UUID("11111111-1111-1111-1111-111111111111")

    run = _make_run_row(uuid4(), TEST_USER_ID)
    stub_storage_client.get_run.return_value = run
    stub_storage_client.get_strategy_by_id.return_value = {
        "id": run["strategy_id"],
        "key": "vwap_pullback_long",
        "display_name": "VWAP Pullback Long",
        "description": "Buy SPY on first VWAP retest after breakout.",
        "symbol": "SPY",
        "direction": "LONG",
        "kind": "rule_based",
        "enabled": True,
    }
    stub_storage_client.get_config_by_id.return_value = {
        "id": run["config_id"],
        "name": "default",
        "mode": "backtest",
        "timeframe": "5m",
        "strategy_id": run["strategy_id"],
        "params": {
            "risk": {"account_value": 25000, "max_risk_per_trade_pct": 0.5},
            "strategy": {
                "enabled_setup": "vwap_pullback_long",
                "opening_range": {"minutes": 15},
            },
        },
    }

    r = unit_client.get(f"/api/runs/{run['id']}/manifest")
    assert r.status_code == 200
    body = r.json()
    assert body["strategy"]["key"] == "vwap_pullback_long"
    assert body["strategy"]["display_name"] == "VWAP Pullback Long"
    assert body["config"]["name"] == "default"
    assert body["config"]["params"]["risk"]["account_value"] == 25000


def test_list_bars_returns_ohlc_in_run_range(unit_client, stub_storage_client):
    from uuid import UUID
    TEST_USER_ID = UUID("11111111-1111-1111-1111-111111111111")

    run = _make_run_row(uuid4(), TEST_USER_ID)
    stub_storage_client.get_run.return_value = run
    stub_storage_client.list_bars.return_value = [
        {
            "bar_start": "2026-05-26T13:30:00+00:00",
            "open": "525.10",
            "high": "525.60",
            "low": "524.95",
            "close": "525.40",
            "volume": 1_250_000,
        },
        {
            "bar_start": "2026-05-26T13:35:00+00:00",
            "open": "525.40",
            "high": "525.80",
            "low": "525.30",
            "close": "525.70",
            "volume": 980_000,
        },
    ]

    r = unit_client.get(f"/api/runs/{run['id']}/bars")
    assert r.status_code == 200
    body = r.json()
    assert "bars" in body
    assert len(body["bars"]) == 2
    first = body["bars"][0]
    assert first["timestamp"].startswith("2026-05-26T13:30:00")
    assert float(first["open"]) == 525.10
    assert float(first["high"]) == 525.60
    assert float(first["low"]) == 524.95
    assert float(first["close"]) == 525.40
    assert first["volume"] == 1_250_000
    assert first["symbol"] == "SPY"

    # Storage was called with the run's date range
    called = stub_storage_client.list_bars.call_args.kwargs
    assert called["range_start"] == "2026-05-26"
    assert called["range_end"] == "2026-05-28"


def test_invalid_cursor_returns_400(unit_client):
    r = unit_client.get("/api/runs?cursor=not-base64!!!")
    assert r.status_code == 400
    assert r.json()["detail"]["error"] == "invalid_cursor"


def test_patch_run_favorite_404_when_not_found(unit_client, stub_storage_client):
    stub_storage_client.get_run.return_value = None
    r = unit_client.patch(f"/api/runs/{uuid4()}", json={"is_favorite": True})
    assert r.status_code == 404


def test_patch_run_favorite_updates_flag(unit_client, stub_storage_client):
    from uuid import UUID
    TEST_USER_ID = UUID("11111111-1111-1111-1111-111111111111")

    run = _make_run_row(uuid4(), TEST_USER_ID)
    stub_storage_client.get_run.return_value = run
    updated = {**run, "is_favorite": True}
    stub_storage_client.update_run_favorite.return_value = updated

    r = unit_client.patch(f"/api/runs/{run['id']}", json={"is_favorite": True})
    assert r.status_code == 200
    body = r.json()
    assert body["is_favorite"] is True

    called = stub_storage_client.update_run_favorite.call_args.kwargs
    assert called["run_id"] == UUID(run["id"])
    assert called["is_favorite"] is True


def test_delete_run_404_when_not_found(unit_client, stub_storage_client):
    stub_storage_client.get_run.return_value = None
    r = unit_client.delete(f"/api/runs/{uuid4()}")
    assert r.status_code == 404


def test_delete_run_happy_path(unit_client, stub_storage_client):
    from uuid import UUID
    TEST_USER_ID = UUID("11111111-1111-1111-1111-111111111111")

    run = _make_run_row(uuid4(), TEST_USER_ID)
    stub_storage_client.get_run.return_value = run
    stub_storage_client.delete_run.return_value = None

    r = unit_client.delete(f"/api/runs/{run['id']}")
    assert r.status_code == 200
    assert r.json() == {"deleted": run["id"]}
    stub_storage_client.delete_run.assert_called_once()


def test_delete_all_runs_returns_count(unit_client, stub_storage_client):
    stub_storage_client.delete_all_runs.return_value = 7
    r = unit_client.delete("/api/runs")
    assert r.status_code == 200
    assert r.json() == {"deleted_count": 7}
    stub_storage_client.delete_all_runs.assert_called_once()
