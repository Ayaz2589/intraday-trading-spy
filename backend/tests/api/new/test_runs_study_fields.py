"""T014 (Feature 014, FR-009) — RunView exposes study membership.

Child runs surface nullable study_id / segment / window_index so the run
detail page can render the "Part of study — window N · segment" badge and
link back to /validation/$studyId. Standalone runs read all-null.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest

pytestmark = pytest.mark.api

TEST_USER_ID = UUID("11111111-1111-1111-1111-111111111111")


def _run_row(run_id, **extra):
    row = {
        "id": str(run_id),
        "user_id": str(TEST_USER_ID),
        "config_id": str(uuid4()),
        "strategy_id": str(uuid4()),
        "started_at": datetime.now(timezone.utc).isoformat(),
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "status": "finished",
        "range_start": "2026-05-26",
        "range_end": "2026-05-28",
        "bar_count": 234,
        "summary": {
            "pnl": "0.0", "win_rate": 0.33, "sharpe": 0.0, "max_drawdown": "-2.0",
            "total_trades": 3, "total_signals": 120, "rejected_signals": 117,
        },
        "data_fingerprint": "fp-abc",
        "app_version": "test",
    }
    row.update(extra)
    return row


def test_get_run_exposes_study_fields_for_child(unit_client, stub_storage_client):
    run_id, study_id = uuid4(), uuid4()
    stub_storage_client.get_run.return_value = _run_row(
        run_id, study_id=str(study_id), segment="validation", window_index=3
    )

    r = unit_client.get(f"/api/runs/{run_id}")

    assert r.status_code == 200
    body = r.json()
    assert body["study_id"] == str(study_id)
    assert body["segment"] == "validation"
    assert body["window_index"] == 3


def test_get_run_study_fields_null_for_standalone(unit_client, stub_storage_client):
    run_id = uuid4()
    # Supabase select("*") returns explicit nulls for the 0111 columns.
    stub_storage_client.get_run.return_value = _run_row(
        run_id, study_id=None, segment=None, window_index=None
    )

    r = unit_client.get(f"/api/runs/{run_id}")

    assert r.status_code == 200
    body = r.json()
    assert body["study_id"] is None
    assert body["segment"] is None
    assert body["window_index"] is None


def test_list_runs_rows_carry_study_fields(unit_client, stub_storage_client):
    study_id = uuid4()

    class _Page:
        next_cursor = None

    page = _Page()
    page.runs = [
        _run_row(uuid4(), study_id=str(study_id), segment="train", window_index=0),
        _run_row(uuid4()),  # pre-0111 row shape (keys absent) must still parse
    ]
    stub_storage_client.list_runs.return_value = page

    r = unit_client.get("/api/runs")

    assert r.status_code == 200
    runs = r.json()["runs"]
    assert runs[0]["study_id"] == str(study_id)
    assert runs[0]["segment"] == "train"
    assert runs[0]["window_index"] == 0
    assert runs[1]["study_id"] is None and runs[1]["segment"] is None
