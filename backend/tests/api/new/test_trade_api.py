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


# ---- T034: performance + journal ---------------------------------------------------

def test_performance_summary_uses_backtest_definitions(
    unit_client, stub_storage_client, alpaca_env,
):
    stub_storage_client.list_paper_trades.return_value = [
        {"id": "t1", "session_id": "ps-1", "trading_day": "2026-06-08",
         "origin": "strategy", "qty": 10, "entry_time": "2026-06-08T14:00:00Z",
         "exit_time": "2026-06-08T15:00:00Z", "entry_price": 525.0,
         "exit_price": 527.0, "stop_loss": 524.0, "take_profit": 527.0,
         "exit_reason": "target", "gross_pnl": 20.0, "fees": 0, "realized_r": 2.0},
        {"id": "t2", "session_id": "ps-1", "trading_day": "2026-06-08",
         "origin": "strategy", "qty": 10, "entry_time": "2026-06-08T15:30:00Z",
         "exit_time": "2026-06-08T15:45:00Z", "entry_price": 525.0,
         "exit_price": 524.0, "stop_loss": 524.0, "take_profit": 527.0,
         "exit_reason": "stop", "gross_pnl": -10.0, "fees": 0, "realized_r": -1.0},
    ]
    stub_storage_client.list_paper_sessions.return_value = [
        {"id": "ps-1", "started_at": "2026-06-08T13:30:00Z", "status": "stopped"},
    ]
    resp = unit_client.get("/api/trade/performance")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    s = body["summary"]
    assert s["trades"] == 2 and s["wins"] == 1
    assert s["win_rate"] == 0.5
    assert s["total_r"] == 1.0                  # +2.0 − 1.0
    assert s["expectancy_r"] == 0.5             # mean R — backtest definition
    assert s["total_gross_pnl"] == 10.0
    # equity curve is cumulative in time order
    assert [p["cum_pnl"] for p in body["equity_curve"]] == [20.0, 10.0]
    assert body["sessions"][0]["trades"] == 2


def test_journal_endpoint_is_seq_incremental(
    unit_client, stub_storage_client, alpaca_env,
):
    stub_storage_client.list_paper_events.return_value = [
        {"seq": 5, "trading_day": "2026-06-08", "timestamp": "t",
         "kind": "emitted", "payload": {}},
    ]
    resp = unit_client.get("/api/trade/journal?session_id=ps-1&since_seq=4")
    assert resp.status_code == 200
    assert resp.json()["events"][0]["seq"] == 5
    kw = stub_storage_client.list_paper_events.call_args.kwargs
    assert kw["since_seq"] == 4


# ---- T040: manual orders (US4) -----------------------------------------------------

def test_manual_order_422_without_stop_or_target(
    unit_client, stub_storage_client, alpaca_env,
):
    resp = unit_client.post("/api/trade/orders", json={"take_profit": 527.0})
    assert resp.status_code == 422
    resp = unit_client.post("/api/trade/orders", json={"stop_loss": 524.0})
    assert resp.status_code == 422


def test_manual_order_409_without_running_session(
    unit_client, stub_storage_client, fake_market, alpaca_env,
):
    stub_storage_client.get_running_paper_session.return_value = None
    resp = unit_client.post(
        "/api/trade/orders", json={"stop_loss": 524.0, "take_profit": 527.0},
    )
    assert resp.status_code == 409
    assert resp.json()["detail"]["error"] == "no_running_session"


def test_close_position_409_when_flat(
    unit_client, stub_storage_client, fake_market, alpaca_env,
):
    fake_market.get_position.return_value = None
    resp = unit_client.post("/api/trade/position/close")
    assert resp.status_code == 409


def test_close_position_200_flattens(
    unit_client, stub_storage_client, fake_market, alpaca_env,
):
    fake_market.get_position.return_value = {"qty": 12, "avg_entry": 525.1,
                                             "unrealized_pnl": 0.0}
    fake_market.flatten.return_value = {"broker_order_id": "ord-c",
                                        "status": "accepted"}
    stub_storage_client.get_running_paper_session.return_value = _session_row()
    resp = unit_client.post("/api/trade/position/close")
    assert resp.status_code == 200, resp.text
    fake_market.flatten.assert_called_once()


# ---- Feature 023: pre-open warmup wiring (US2) -------------------------------------

def _warmup_1m_df(start_hh=9, start_mm=30, n=12):
    """A regular-session 1m frame like fetch_intraday_df returns (start=09:30)."""
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    import pandas as pd

    et = ZoneInfo("America/New_York")
    t0 = datetime(2026, 6, 8, start_hh, start_mm, tzinfo=et)
    rows, px = [], 525.0
    for i in range(n):
        px += 0.05
        rows.append({"timestamp": t0 + timedelta(minutes=i), "open": px,
                     "high": px + 0.1, "low": px - 0.1, "close": px + 0.05,
                     "volume": 1000})
    return pd.DataFrame(rows)


def test_fetch_warmup_bars_aggregates_completed_5m_rth_only(monkeypatch):
    """T012 / FR-007 — warmup yields completed 5m bars, all at/after 09:30 ET
    (RTH-only by construction; the open final bucket is left to the stream)."""
    from zoneinfo import ZoneInfo

    from intraday_trade_spy.api.routers import trade as trade_router

    et = ZoneInfo("America/New_York")
    monkeypatch.setattr(trade_router, "fetch_intraday_df",
                        lambda: _warmup_1m_df(n=12))  # 09:30–09:41 → buckets 30,35
    bars = trade_router.fetch_warmup_bars()
    assert len(bars) >= 2  # 09:30 and 09:35 completed buckets
    assert all(b.timestamp.astimezone(et).time().hour * 60
               + b.timestamp.astimezone(et).time().minute >= 9 * 60 + 30
               for b in bars)
    # completed-bucket granularity: every returned bar is on a 5-min boundary
    assert all(b.timestamp.astimezone(et).minute % 5 == 0 for b in bars)


def test_fetch_warmup_bars_empty_when_no_data(monkeypatch):
    """T011 / FR-008 — empty fetch → empty warmup, no error."""
    import pandas as pd

    from intraday_trade_spy.api.routers import trade as trade_router

    monkeypatch.setattr(trade_router, "fetch_intraday_df", lambda: pd.DataFrame())
    assert trade_router.fetch_warmup_bars() == []


def test_fetch_warmup_bars_fail_soft_when_fetch_raises(monkeypatch):
    """T011 / FR-008 — a fetch error must not escape; warmup degrades to []."""
    from intraday_trade_spy.api.routers import trade as trade_router

    def _boom():
        raise RuntimeError("alpaca down")

    monkeypatch.setattr(trade_router, "fetch_intraday_df", _boom)
    assert trade_router.fetch_warmup_bars() == []


def test_warmup_session_journals_loaded_count(monkeypatch):
    """T011 / FR-006 — the start path journals a `warmup` event with loaded=N."""
    from unittest import mock

    from intraday_trade_spy.api.routers import trade as trade_router

    monkeypatch.setattr(trade_router, "fetch_intraday_df", lambda: _warmup_1m_df(n=12))
    storage = mock.MagicMock()
    bars = trade_router.warmup_session(storage, "ps-1")
    assert len(bars) >= 2
    evt = [c.kwargs for c in storage.append_paper_event.call_args_list
           if c.kwargs.get("kind") == "warmup"]
    assert len(evt) == 1
    assert evt[0]["payload"]["loaded"] == len(bars)


def test_warmup_session_journals_zero_on_failure(monkeypatch):
    """T011 / FR-008 — on fetch failure, warmup is journaled loaded=0, no raise."""
    from unittest import mock

    from intraday_trade_spy.api.routers import trade as trade_router

    def _boom():
        raise RuntimeError("alpaca down")

    monkeypatch.setattr(trade_router, "fetch_intraday_df", _boom)
    storage = mock.MagicMock()
    bars = trade_router.warmup_session(storage, "ps-1")
    assert bars == []
    evt = [c.kwargs for c in storage.append_paper_event.call_args_list
           if c.kwargs.get("kind") == "warmup"]
    assert len(evt) == 1 and evt[0]["payload"]["loaded"] == 0


# ---- Feature 024: resilient Alpaca REST fetchers (retry + clean 503) --------------

def test_is_transient_net_error_classifies_ssl_and_timeouts():
    from intraday_trade_spy.api.routers import trade as t
    assert t.is_transient_net_error(Exception("SSL: UNEXPECTED_EOF_WHILE_READING"))
    assert t.is_transient_net_error(Exception("HTTPSConnectionPool ... Max retries exceeded"))
    assert t.is_transient_net_error(Exception("connection reset by peer"))
    assert t.is_transient_net_error(TimeoutError("timed out"))
    assert not t.is_transient_net_error(ValueError("bad request"))
    assert not t.is_transient_net_error(KeyError("SPY"))


def test_retry_transient_retries_then_succeeds():
    from intraday_trade_spy.api.routers import trade as t
    calls, sleeps = [], []
    def flaky():
        calls.append(1)
        if len(calls) < 3:
            raise Exception("SSL: UNEXPECTED_EOF_WHILE_READING")
        return "ok"
    out = t.retry_transient(flaky, attempts=3, backoff=(0.1, 0.2), sleep=sleeps.append)
    assert out == "ok"
    assert len(calls) == 3 and sleeps == [0.1, 0.2]


def test_retry_transient_reraises_non_transient_immediately():
    from intraday_trade_spy.api.routers import trade as t
    calls = []
    def boom():
        calls.append(1)
        raise ValueError("not a network error")
    import pytest as _pytest
    with _pytest.raises(ValueError):
        t.retry_transient(boom, attempts=3, sleep=lambda s: None)
    assert len(calls) == 1   # no retry on non-transient


def test_retry_transient_exhausts_then_reraises():
    from intraday_trade_spy.api.routers import trade as t
    calls = []
    def always():
        calls.append(1)
        raise Exception("connection reset")
    import pytest as _pytest
    with _pytest.raises(Exception, match="connection reset"):
        t.retry_transient(always, attempts=3, sleep=lambda s: None)
    assert len(calls) == 3


def test_trade_bars_returns_503_on_transient_fetch_error(
    unit_client, stub_storage_client, alpaca_env, monkeypatch,
):
    """A persistent transient Alpaca error surfaces as a clean 503, not a 500."""
    from intraday_trade_spy.api.routers import trade as trade_router

    def _ssl_boom():
        raise Exception("SSL: UNEXPECTED_EOF_WHILE_READING (data.alpaca.markets)")

    monkeypatch.setattr(trade_router, "fetch_intraday_df", _ssl_boom)
    stub_storage_client.get_running_paper_session.return_value = None
    resp = unit_client.get("/api/trade/bars?view=1m")
    assert resp.status_code == 503, resp.text
    assert resp.json()["detail"]["error"] == "data_unavailable"
