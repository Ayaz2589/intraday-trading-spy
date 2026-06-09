"""Feature 022 (T013/T014/T032/T043/T052) — /api/replay endpoints.

Uses the unit_client + stub_storage_client fixtures (auth + storage stubbed).
The background pacer is monkeypatched to a no-op so progression is driven
deterministically via the REPLAY_RUNNING registry."""

from __future__ import annotations

import csv

import pytest

from intraday_trade_spy.api.routers import replay as replay_router
from intraday_trade_spy.replay.runner import REPLAY_RUNNING

pytestmark = pytest.mark.api

DAY = "2026-05-26"


@pytest.fixture(autouse=True)
def _clean_registry():
    REPLAY_RUNNING.clear()
    yield
    REPLAY_RUNNING.clear()


@pytest.fixture(autouse=True)
def _no_background_pacer(monkeypatch):
    async def _noop(_runner):
        return None

    monkeypatch.setattr(replay_router, "_pace", _noop)


def _sample_rows(sample_csv_path):
    rows = []
    with open(sample_csv_path) as f:
        for r in csv.DictReader(f):
            rows.append({
                "bar_start": r["timestamp"], "open": float(r["open"]),
                "high": float(r["high"]), "low": float(r["low"]),
                "close": float(r["close"]), "volume": int(r["volume"]),
                "source": "test",
            })
    return rows


@pytest.fixture()
def wired_storage(stub_storage_client, sample_csv_path):
    rows = _sample_rows(sample_csv_path)
    stub_storage_client.get_active_config.return_value = None  # use base config
    stub_storage_client.list_bars.return_value = rows
    stub_storage_client.bars_present_session_dates.return_value = [
        "2026-05-26", "2026-05-27", "2026-05-28",
    ]
    return stub_storage_client


def test_dates_intersects_calendar(unit_client, wired_storage):
    r = unit_client.get("/api/replay/dates")
    assert r.status_code == 200
    body = r.json()
    assert DAY in body["dates"]
    assert body["latest"] == body["dates"][0]


def test_state_empty_when_no_replay(unit_client, wired_storage):
    r = unit_client.get("/api/replay/state")
    assert r.status_code == 200
    assert r.json() == {"session": None}


def test_start_then_second_start_conflicts(unit_client, wired_storage):
    r = unit_client.post("/api/replay/start", json={"date": DAY, "speed": 300})
    assert r.status_code == 201, r.text
    assert r.json()["session"]["session_date"] == DAY
    r2 = unit_client.post("/api/replay/start", json={"date": DAY})
    assert r2.status_code == 409


def test_start_uncovered_date_422(unit_client, wired_storage):
    # 2026-05-30 is a Saturday — list_bars returns the sample rows, but the
    # session filter yields no bars for that date.
    r = unit_client.post("/api/replay/start", json={"date": "2026-05-30"})
    assert r.status_code == 422


def test_start_bad_speed_422(unit_client, wired_storage):
    r = unit_client.post("/api/replay/start", json={"date": DAY, "speed": 7})
    assert r.status_code == 422


def test_control_play_pause_speed_and_stop(unit_client, wired_storage):
    unit_client.post("/api/replay/start", json={"date": DAY, "speed": 60})
    assert unit_client.post("/api/replay/control", json={"action": "pause"}).json()[
        "session"]["status"] == "paused"
    assert unit_client.post("/api/replay/control", json={"action": "play"}).json()[
        "session"]["status"] == "playing"
    sp = unit_client.post("/api/replay/control", json={"action": "speed", "speed": 600})
    assert sp.json()["session"]["speed"] == 600
    st = unit_client.post("/api/replay/stop")
    assert st.status_code == 200
    assert st.json()["session"]["status"] == "stopped"
    # registry cleared → state empty again
    assert unit_client.get("/api/replay/state").json() == {"session": None}


def test_control_without_replay_404(unit_client, wired_storage):
    assert unit_client.post("/api/replay/control", json={"action": "play"}).status_code == 404


def test_bars_incremental_after_manual_advance(unit_client, wired_storage):
    unit_client.post("/api/replay/start", json={"date": DAY, "speed": 60})
    # Drive pacing deterministically through the registry (pacer is a no-op).
    runner = next(iter(REPLAY_RUNNING.values()))
    runner.advance(30.0)  # 30 real * 60 = 1800 sim-sec → 09:30..10:00 = 7 bars
    r = unit_client.get("/api/replay/bars")
    body = r.json()
    assert body["view"] == "5m"
    assert len(body["bars"]) == 7
    since = body["bars"][2]["t"]
    r2 = unit_client.get(f"/api/replay/bars?since={since}")
    assert all(b["t"] > since for b in r2.json()["bars"])


def test_automation_toggle_and_journal(unit_client, wired_storage):
    unit_client.post("/api/replay/start", json={"date": DAY, "speed": 3600,
                                                "automation": True})
    runner = next(iter(REPLAY_RUNNING.values()))
    runner.advance(60.0)  # run the whole session
    j = unit_client.get("/api/replay/journal")
    kinds = {e["kind"] for e in j.json()["events"]}
    assert "session_started" in kinds
    assert "replay_completed" in kinds
    perf = unit_client.get("/api/replay/performance").json()
    assert "summary" in perf


def test_replay_never_touches_paper_tables(unit_client, wired_storage):
    """SC-005 structural check: a full replay calls no paper_* storage writes."""
    unit_client.post("/api/replay/start", json={"date": DAY, "speed": 3600,
                                                "automation": True})
    runner = next(iter(REPLAY_RUNNING.values()))
    runner.advance(60.0)
    unit_client.post("/api/replay/stop")
    for name in dir(wired_storage):
        if name.startswith("insert_paper") or name.startswith("append_paper") or \
           name.startswith("update_paper") or name.startswith("stop_paper"):
            assert not getattr(wired_storage, name).called
