"""Feature 021 T019 — /api/trade automation start/stop HTTP contract
(contracts/trade-api.md). The session runner is stubbed out; GETs are
covered in later phases as their endpoints land."""

from uuid import uuid4

import pytest

pytestmark = pytest.mark.api


def _session_row(**over):
    row = {
        "id": str(uuid4()),
        "strategy_id": str(uuid4()),
        "config_id": str(uuid4()),
        "config_name": "default",
        "config_snapshot": {"risk": {"account_value": 25000.0}},
        "status": "running",
        "entries_paused": False,
        "pause_reason": None,
        "started_at": "2026-06-08T13:30:00Z",
        "stopped_at": None,
        "stop_reason": None,
        "created_at": "2026-06-08T13:30:00Z",
        "updated_at": "2026-06-08T13:30:00Z",
    }
    row.update(over)
    return row


@pytest.fixture
def no_runner(monkeypatch):
    """The router enqueues the live session runner via BackgroundTasks —
    stub it out and capture invocations."""
    calls = []

    from intraday_trade_spy.api.routers import trade as trade_router

    monkeypatch.setattr(trade_router, "run_paper_session_task",
                        lambda **kw: calls.append(kw))
    return calls


@pytest.fixture
def alpaca_env(monkeypatch):
    monkeypatch.setenv("ALPACA_API_KEY", "k")
    monkeypatch.setenv("ALPACA_SECRET_KEY", "s")


def _active_config(stub):
    cfg = {"id": str(uuid4()), "name": "default", "strategy_id": str(uuid4()),
           "params": {"risk": {"account_value": 25000.0}}, "is_active": True}
    stub.get_active_config.return_value = cfg
    return cfg


# ---- start ---------------------------------------------------------------------

def test_start_201_snapshots_active_config_and_enqueues(
    unit_client, stub_storage_client, no_runner, alpaca_env,
):
    cfg = _active_config(stub_storage_client)
    row = _session_row(config_id=cfg["id"], strategy_id=cfg["strategy_id"])
    stub_storage_client.insert_paper_session.return_value = row

    resp = unit_client.post("/api/trade/automation/start", json={})
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "running"
    kwargs = stub_storage_client.insert_paper_session.call_args.kwargs
    assert kwargs["config_name"] == "default"
    assert kwargs["config_snapshot"] == cfg["params"]  # frozen at start (FR-002)
    assert len(no_runner) == 1
    # the start itself is journaled (FR-001)
    kinds = [c.kwargs["kind"] for c in
             stub_storage_client.append_paper_event.call_args_list]
    assert "session_started" in kinds


def test_start_409_when_one_is_running(
    unit_client, stub_storage_client, no_runner, alpaca_env,
):
    from intraday_trade_spy.storage.client import PaperSessionAlreadyRunning

    _active_config(stub_storage_client)
    stub_storage_client.insert_paper_session.side_effect = (
        PaperSessionAlreadyRunning("ps-9")
    )
    resp = unit_client.post("/api/trade/automation/start", json={})
    assert resp.status_code == 409
    assert resp.json()["detail"]["error"] == "session_already_running"
    assert no_runner == []


def test_start_422_without_alpaca_credentials(
    unit_client, stub_storage_client, no_runner, monkeypatch,
):
    monkeypatch.delenv("ALPACA_API_KEY", raising=False)
    monkeypatch.delenv("ALPACA_SECRET_KEY", raising=False)
    _active_config(stub_storage_client)
    resp = unit_client.post("/api/trade/automation/start", json={})
    assert resp.status_code == 422
    assert resp.json()["detail"]["error"] == "alpaca_credentials_missing"
    assert no_runner == []


def test_start_404_without_active_config(
    unit_client, stub_storage_client, no_runner, alpaca_env,
):
    stub_storage_client.get_active_config.return_value = None
    resp = unit_client.post("/api/trade/automation/start", json={})
    assert resp.status_code == 404


# ---- stop ----------------------------------------------------------------------

def test_stop_200_flips_row_and_journals(
    unit_client, stub_storage_client, no_runner,
):
    row = _session_row()
    stub_storage_client.get_running_paper_session.return_value = row
    stub_storage_client.stop_paper_session.return_value = True
    resp = unit_client.post("/api/trade/automation/stop")
    assert resp.status_code == 200, resp.text
    kwargs = stub_storage_client.stop_paper_session.call_args.kwargs
    assert kwargs["status"] == "stopped" and kwargs["stop_reason"] == "operator"
    kinds = [c.kwargs["kind"] for c in
             stub_storage_client.append_paper_event.call_args_list]
    assert "session_stopped" in kinds


def test_stop_409_when_nothing_running(unit_client, stub_storage_client, no_runner):
    stub_storage_client.get_running_paper_session.return_value = None
    resp = unit_client.post("/api/trade/automation/stop")
    assert resp.status_code == 409


# ---- T021: startup reconciler (FR-009) -------------------------------------------

def test_reconciler_interrupts_and_journals_each_session():
    from unittest import mock

    from intraday_trade_spy.api.routers.trade import (
        reconcile_interrupted_paper_sessions,
    )

    storage = mock.MagicMock()
    storage.interrupt_running_paper_sessions.return_value = ["ps-1", "ps-2"]
    n = reconcile_interrupted_paper_sessions(storage)
    assert n == 2
    storage.interrupt_running_paper_sessions.assert_called_once()
    kinds = [c.kwargs["kind"] for c in storage.append_paper_event.call_args_list]
    assert kinds == ["session_interrupted", "session_interrupted"]


# ---- T023: GET /api/trade/state + /bars + ack-pause -------------------------------

@pytest.fixture
def fake_market(monkeypatch):
    """Stub the Alpaca data fetchers + broker on the router module."""
    from datetime import datetime, timedelta
    from unittest import mock
    from zoneinfo import ZoneInfo

    import pandas as pd

    ET = ZoneInfo("America/New_York")
    t0 = datetime(2026, 6, 8, 9, 30, tzinfo=ET)
    rows = []
    px = 525.0
    for i in range(12):
        px += 0.1
        rows.append({"timestamp": t0 + timedelta(minutes=i), "open": px,
                     "high": px + 0.2, "low": px - 0.2, "close": px + 0.1,
                     "volume": 1000})
    df_1m = pd.DataFrame(rows)
    df_daily = pd.DataFrame([
        {"timestamp": datetime(2026, 6, d, 0, 0, tzinfo=ET), "open": 520 + d,
         "high": 521 + d, "low": 519 + d, "close": 520.5 + d,
         "volume": 1_000_000} for d in range(1, 6)
    ])

    from intraday_trade_spy.api.routers import trade as trade_router

    monkeypatch.setattr(trade_router, "fetch_intraday_df", lambda: df_1m)
    monkeypatch.setattr(trade_router, "fetch_daily_df", lambda days: df_daily)

    broker = mock.MagicMock()
    broker.get_position.return_value = {"qty": 12, "avg_entry": 525.1,
                                        "unrealized_pnl": 14.4}
    broker.get_open_orders.return_value = [
        {"broker_order_id": "b1", "status": "accepted", "side": "sell",
         "qty": 12, "limit_price": 526.9, "stop_price": None, "type": "limit"},
        {"broker_order_id": "b2", "status": "accepted", "side": "sell",
         "qty": 12, "limit_price": None, "stop_price": 524.2, "type": "stop"},
    ]
    broker.get_account.return_value = {"equity": 100231.55,
                                       "buying_power": 400000.0}
    monkeypatch.setattr(trade_router, "AlpacaPaperBroker", lambda: broker)
    return broker


def test_state_returns_session_market_position_account(
    unit_client, stub_storage_client, fake_market, alpaca_env,
):
    row = _session_row()
    stub_storage_client.get_running_paper_session.return_value = row
    stub_storage_client.list_paper_trades.return_value = [
        {"trading_day": "2026-06-08", "gross_pnl": -12.5, "realized_r": -1.0},
    ]
    resp = unit_client.get("/api/trade/state")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["session"]["id"] == row["id"]
    assert body["position"]["qty"] == 12
    assert body["account"]["broker_equity"] == 100231.55
    assert body["account"]["sizing_account_value"] == 25000.0
    assert "is_open" in body["market"] and "data_fresh" in body["market"]
    assert len(body["open_orders"]) == 2


def test_state_with_no_session_and_no_creds_still_works(
    unit_client, stub_storage_client, fake_market, monkeypatch,
):
    monkeypatch.delenv("ALPACA_API_KEY", raising=False)
    monkeypatch.delenv("ALPACA_SECRET_KEY", raising=False)
    stub_storage_client.get_running_paper_session.return_value = None
    resp = unit_client.get("/api/trade/state")
    assert resp.status_code == 200
    body = resp.json()
    assert body["session"] is None
    assert body["position"] is None and body["account"] is None


def test_bars_intraday_views_have_vwap_and_since_increments(
    unit_client, stub_storage_client, fake_market, alpaca_env,
):
    stub_storage_client.get_running_paper_session.return_value = None
    resp = unit_client.get("/api/trade/bars?view=1m")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["view"] == "1m" and body["vwap_available"] is True
    assert len(body["bars"]) == 12
    assert body["bars"][0]["vwap"] is not None
    cut = body["bars"][8]["t"]
    resp2 = unit_client.get(f"/api/trade/bars?view=1m&since={cut}")
    assert len(resp2.json()["bars"]) == 3
    assert resp2.json()["next_since"] == body["bars"][-1]["t"]


def test_bars_30d_has_no_vwap_with_reason(
    unit_client, stub_storage_client, fake_market, alpaca_env,
):
    stub_storage_client.get_running_paper_session.return_value = None
    resp = unit_client.get("/api/trade/bars?view=30d")
    body = resp.json()
    assert body["vwap_available"] is False
    assert "session" in body["vwap_reason"].lower()
    assert all(b["vwap"] is None for b in body["bars"])


def test_bars_rejects_unknown_view(unit_client, stub_storage_client, alpaca_env):
    resp = unit_client.get("/api/trade/bars?view=2h")
    assert resp.status_code == 422


def test_ack_pause_clears_mismatch(
    unit_client, stub_storage_client, fake_market, alpaca_env,
):
    row = _session_row(entries_paused=True, pause_reason="reconcile_mismatch")
    stub_storage_client.get_running_paper_session.return_value = row
    resp = unit_client.post("/api/trade/automation/ack-pause")
    assert resp.status_code == 200, resp.text
    stub_storage_client.set_paper_session_pause.assert_called_once()
    kw = stub_storage_client.set_paper_session_pause.call_args.kwargs
    assert kw["paused"] is False
