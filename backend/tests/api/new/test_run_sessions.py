"""Run-viewer session scale fix (post-014) — per-session data loading.

Study child runs can span years (250+ sessions, ~20k bars). The viewer now
loads the session-date list from a cheap dedicated endpoint and bars for ONE
session at a time, instead of every bar in the run's range at once.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest

pytestmark = pytest.mark.api


def _run_row(run_id):
    return {
        "id": str(run_id),
        "user_id": "11111111-1111-1111-1111-111111111111",
        "config_id": str(uuid4()),
        "strategy_id": str(uuid4()),
        "started_at": datetime.now(timezone.utc).isoformat(),
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "status": "finished",
        "range_start": "2018-07-02",
        "range_end": "2019-06-28",
        "bar_count": 19496,
        "summary": {
            "pnl": "145.11", "win_rate": 0.5, "sharpe": 0.2, "max_drawdown": "-2.0",
            "total_trades": 453, "total_signals": 510, "rejected_signals": 57,
        },
        "data_fingerprint": "fp-abc",
        "app_version": "test",
    }


def test_run_sessions_lists_session_dates(unit_client, stub_storage_client):
    run_id = uuid4()
    stub_storage_client.get_run.return_value = _run_row(run_id)
    stub_storage_client.bars_present_session_dates.return_value = [
        "2018-07-02", "2018-07-03", "2018-07-05",
    ]

    r = unit_client.get(f"/api/runs/{run_id}/sessions")

    assert r.status_code == 200
    assert r.json()["sessions"] == ["2018-07-02", "2018-07-03", "2018-07-05"]
    kwargs = stub_storage_client.bars_present_session_dates.call_args.kwargs
    assert kwargs == {"range_start": "2018-07-02", "range_end": "2019-06-28"}


def test_run_sessions_404_for_unknown_run(unit_client, stub_storage_client):
    stub_storage_client.get_run.return_value = None
    r = unit_client.get(f"/api/runs/{uuid4()}/sessions")
    assert r.status_code == 404


def test_bars_endpoint_filters_to_one_session(unit_client, stub_storage_client):
    run_id = uuid4()
    stub_storage_client.get_run.return_value = _run_row(run_id)
    stub_storage_client.list_bars.return_value = []

    r = unit_client.get(f"/api/runs/{run_id}/bars?session=2018-09-14")

    assert r.status_code == 200
    kwargs = stub_storage_client.list_bars.call_args.kwargs
    assert kwargs == {"range_start": "2018-09-14", "range_end": "2018-09-14"}


def test_bars_endpoint_without_session_keeps_full_range(unit_client, stub_storage_client):
    run_id = uuid4()
    stub_storage_client.get_run.return_value = _run_row(run_id)
    stub_storage_client.list_bars.return_value = []

    r = unit_client.get(f"/api/runs/{run_id}/bars")

    assert r.status_code == 200
    kwargs = stub_storage_client.list_bars.call_args.kwargs
    assert kwargs == {"range_start": "2018-07-02", "range_end": "2019-06-28"}
