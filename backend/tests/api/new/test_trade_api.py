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
