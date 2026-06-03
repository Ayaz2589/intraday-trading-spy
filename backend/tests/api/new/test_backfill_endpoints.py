"""Feature 009 — backfill endpoint contracts (TDD, constitution IV).

Uses unit_client + stub_storage_client (no real Supabase/network).
"""

from __future__ import annotations

from uuid import uuid4

import pytest

pytestmark = pytest.mark.api


def test_post_backfill_happy_returns_202_queued(unit_client, stub_storage_client):
    stub_storage_client.count_active_backfills.return_value = 0
    stub_storage_client.insert_backfill_job.return_value = str(uuid4())
    r = unit_client.post(
        "/api/bars/backfill",
        json={"start": "2025-01-01", "end": "2025-02-01", "source": "alpaca"},
    )
    assert r.status_code == 202, r.text
    body = r.json()
    assert body["status"] == "queued"
    assert "job_id" in body
    stub_storage_client.insert_backfill_job.assert_called_once()


def test_post_backfill_end_before_start_400(unit_client, stub_storage_client):
    stub_storage_client.count_active_backfills.return_value = 0
    r = unit_client.post(
        "/api/bars/backfill", json={"start": "2025-02-01", "end": "2025-01-01"}
    )
    assert r.status_code == 400
    assert r.json()["detail"]["error"] == "end_before_start"


def test_post_backfill_future_date_400(unit_client, stub_storage_client):
    stub_storage_client.count_active_backfills.return_value = 0
    r = unit_client.post(
        "/api/bars/backfill", json={"start": "2025-01-01", "end": "2999-01-01"}
    )
    assert r.status_code == 400
    assert r.json()["detail"]["error"] == "future_date"


def test_post_backfill_at_cap_429(unit_client, stub_storage_client):
    stub_storage_client.count_active_backfills.return_value = 5  # >= cap (1)
    r = unit_client.post(
        "/api/bars/backfill", json={"start": "2025-01-01", "end": "2025-02-01"}
    )
    assert r.status_code == 429
    assert r.json()["detail"]["error"] == "backfill_in_progress"


def test_get_backfill_status_found(unit_client, stub_storage_client):
    job_id = uuid4()
    stub_storage_client.get_backfill_job.return_value = {
        "id": str(job_id),
        "user_id": "11111111-1111-1111-1111-111111111111",
        "status": "running",
        "source": "alpaca",
        "range_start": "2018-01-01",
        "range_end": "2026-06-01",
        "windows_total": 100,
        "windows_done": 40,
        "bars_added": 180000,
        "gap_session_dates": ["2018-07-03"],
        "failure_reason": None,
        "created_at": "2026-06-03T00:00:00Z",
        "updated_at": "2026-06-03T00:05:00Z",
    }
    r = unit_client.get(f"/api/bars/backfill/{job_id}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["job_id"] == str(job_id)
    assert body["status"] == "running"
    assert body["windows_done"] == 40
    assert body["gap_session_dates"] == ["2018-07-03"]


def test_get_backfill_status_not_found_404(unit_client, stub_storage_client):
    stub_storage_client.get_backfill_job.return_value = None
    r = unit_client.get(f"/api/bars/backfill/{uuid4()}")
    assert r.status_code == 404
    assert r.json()["detail"]["error"] == "job_not_found"
