"""Feature 021 T005 — paper trading storage CRUD (data-model.md, migration 0129).

psycopg-pool-backed like campaigns: session insert (one-running rule →
PaperSessionAlreadyRunning), status flips, order/trade inserts, append-only
events with a per-session monotone seq, and the startup reconciler.
"""

from __future__ import annotations

import json
from unittest import mock

import pytest

USER = "11111111-1111-1111-1111-111111111111"


def _client():
    from intraday_trade_spy.storage import SupabaseStorageClient

    with mock.patch(
        "intraday_trade_spy.storage.client.create_client", return_value=mock.MagicMock()
    ):
        return SupabaseStorageClient(url="https://t.co", service_role_key="k", user_id=USER)


class _FakeCursor:
    def __init__(self, state):
        self._state = state
        self.rowcount = 1

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, params=None):
        self._state["calls"].append((" ".join(sql.split()), params))
        raiser = self._state.get("raise_on")
        if raiser and raiser[0] in sql:
            raise raiser[1]
        self.rowcount = self._state.get("rowcount", 1)

    def fetchone(self):
        return self._state["rows"].pop(0) if self._state.get("rows") else None

    def fetchall(self):
        rows, self._state["rows"] = self._state.get("rows", []), []
        return rows


def _arm(monkeypatch, *, rows=None, raise_on=None, rowcount=1):
    state = {"calls": [], "rows": list(rows or []), "raise_on": raise_on, "rowcount": rowcount}

    class FakeConn:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def cursor(self):
            return _FakeCursor(state)

    class FakePool:
        def connection(self):
            return FakeConn()

    from intraday_trade_spy.storage import db_pool

    monkeypatch.setattr(db_pool, "get_pool", lambda: FakePool())
    return state


SESSION_ROW = (
    "ps-1", "s-1", "cfg-1", "default", json.dumps({"risk": {}}), "running",
    False, None, "2026-06-08T13:30:00Z", None, None,
    "2026-06-08T13:30:00Z", "2026-06-08T13:30:00Z",
)


def test_insert_paper_session_returns_running_row(monkeypatch):
    c = _client()
    state = _arm(monkeypatch, rows=[SESSION_ROW])
    row = c.insert_paper_session(
        strategy_id="s-1", config_id="cfg-1", config_name="default",
        config_snapshot={"risk": {}},
    )
    assert row["id"] == "ps-1" and row["status"] == "running"
    assert row["config_snapshot"] == {"risk": {}}
    sql = state["calls"][0][0]
    assert "INSERT INTO public.paper_sessions" in sql


def test_second_running_session_raises_already_running(monkeypatch):
    from intraday_trade_spy.storage.client import PaperSessionAlreadyRunning

    c = _client()

    class UniqueViolation(Exception):
        sqlstate = "23505"

    _arm(monkeypatch, raise_on=("INSERT INTO public.paper_sessions", UniqueViolation()))
    with pytest.raises(PaperSessionAlreadyRunning):
        c.insert_paper_session(
            strategy_id="s-1", config_id=None, config_name="default",
            config_snapshot={},
        )


def test_stop_paper_session_flips_status_with_reason(monkeypatch):
    c = _client()
    state = _arm(monkeypatch)
    c.stop_paper_session(session_id="ps-1", status="stopped", stop_reason="operator")
    sql, params = state["calls"][0]
    assert "UPDATE public.paper_sessions" in sql
    assert "status = 'running'" in sql  # only a running session can be stopped
    assert "stopped" in params and "operator" in params


def test_set_paper_session_pause_toggles_entries_paused(monkeypatch):
    c = _client()
    state = _arm(monkeypatch)
    c.set_paper_session_pause(session_id="ps-1", paused=True, reason="stale_data")
    sql, params = state["calls"][0]
    assert "entries_paused" in sql and "pause_reason" in sql
    assert True in params and "stale_data" in params


def test_interrupt_running_paper_sessions_is_the_startup_reconciler(monkeypatch):
    c = _client()
    state = _arm(monkeypatch, rowcount=1)
    n = c.interrupt_running_paper_sessions(reason="service restart")
    assert n == 1
    sql, params = state["calls"][0]
    assert "status = 'running'" in sql and "'interrupted'" in sql
    assert any("service restart" in str(p) for p in params)


def test_insert_paper_order_carries_legs_and_origin(monkeypatch):
    c = _client()
    state = _arm(monkeypatch, rows=[("po-1",)])
    oid = c.insert_paper_order(
        session_id="ps-1", broker_order_id="b-9", client_order_id="its-1",
        leg="entry", origin="strategy", side="buy", qty=12,
        limit_price=None, stop_price=None, status="submitted", raw={"x": 1},
    )
    assert oid == "po-1"
    sql, params = state["calls"][0]
    assert "INSERT INTO public.paper_orders" in sql
    assert "entry" in params and "strategy" in params and 12 in params


def test_update_paper_order_status_records_fill(monkeypatch):
    c = _client()
    state = _arm(monkeypatch)
    c.update_paper_order(
        broker_order_id="b-9", status="filled", filled_qty=12,
        filled_avg_price=525.10, raw={"event": "fill"},
    )
    sql, params = state["calls"][0]
    assert "UPDATE public.paper_orders" in sql and "broker_order_id" in sql
    assert "filled" in params and 12 in params


def test_insert_paper_trade_round_trip(monkeypatch):
    c = _client()
    state = _arm(monkeypatch, rows=[("pt-1",)])
    tid = c.insert_paper_trade(
        session_id="ps-1", trading_day="2026-06-08", origin="strategy", qty=12,
        entry_time="2026-06-08T14:00:00Z", exit_time="2026-06-08T15:00:00Z",
        entry_price=525.10, exit_price=526.90, stop_loss=524.20,
        take_profit=526.90, exit_reason="target", gross_pnl=21.6,
        realized_r=2.0, entry_order_id="po-1", exit_order_id="po-2",
    )
    assert tid == "pt-1"
    sql, params = state["calls"][0]
    assert "INSERT INTO public.paper_trades" in sql
    assert "target" in params and 2.0 in params


def test_append_paper_event_assigns_next_seq_in_sql(monkeypatch):
    c = _client()
    state = _arm(monkeypatch, rows=[(7,)])
    seq = c.append_paper_event(
        session_id="ps-1", trading_day="2026-06-08",
        timestamp="2026-06-08T14:00:00Z", kind="emitted",
        payload={"planned_entry": 525.1},
    )
    assert seq == 7
    sql, params = state["calls"][0]
    assert "INSERT INTO public.paper_events" in sql
    # monotone per-session sequence computed in SQL, not in Python
    assert "max(seq)" in sql.lower()
    assert "emitted" in params


def test_list_paper_events_is_seq_incremental(monkeypatch):
    c = _client()
    state = _arm(monkeypatch, rows=[
        (5, "2026-06-08", "2026-06-08T14:00:00Z", "emitted", json.dumps({"a": 1})),
        (6, "2026-06-08", "2026-06-08T14:05:00Z", "rejected", json.dumps({"b": 2})),
    ])
    rows = c.list_paper_events(session_id="ps-1", since_seq=4)
    assert [r["seq"] for r in rows] == [5, 6]
    assert rows[0]["payload"] == {"a": 1}
    sql, params = state["calls"][0]
    assert "seq > %s" in sql and 4 in params


def test_get_running_paper_session_scopes_to_user(monkeypatch):
    c = _client()
    state = _arm(monkeypatch, rows=[SESSION_ROW])
    row = c.get_running_paper_session()
    assert row["id"] == "ps-1"
    sql, params = state["calls"][0]
    assert "status = 'running'" in sql and USER in params


def test_list_paper_trades_orders_by_time(monkeypatch):
    c = _client()
    _arm(monkeypatch, rows=[])
    assert c.list_paper_trades() == []
