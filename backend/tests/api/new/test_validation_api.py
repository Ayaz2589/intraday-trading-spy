"""T021/T031 — /api/validation/* endpoints (Feature 011).

Uses the unit_client (auth + storage deps overridden with a MagicMock), so no
real Supabase. The background task that the launch enqueues runs after the
response with the stub storage and swallows its own errors — these tests assert
only the HTTP contract.
"""

from types import SimpleNamespace
from uuid import uuid4

import pytest

pytestmark = pytest.mark.api  # in-process TestClient; exempt from the socket blocker


def _study_row(**over):
    row = {
        "id": str(uuid4()),
        "kind": "walk_forward",
        "status": "finished",
        "progress_completed": 24,
        "progress_total": 24,
        "result": {"mode": "rolling", "mean_oos": {}},
        "failure_reason": None,
        "created_at": "2026-06-03T12:00:00Z",
    }
    row.update(over)
    return row


def test_launch_walk_forward_returns_202_and_planned(unit_client, stub_storage_client):
    stub_storage_client.get_config_by_name.return_value = {"params": {}}
    stub_storage_client.insert_validation_study.return_value = "sid"

    resp = unit_client.post(
        "/api/validation/studies", json={"kind": "walk_forward", "config_name": "default"}
    )
    assert resp.status_code == 202, resp.text
    body = resp.json()
    assert body["status"] == "queued"
    # Default split (2018→2024) with rolling 12/6/6 → 12 windows × (IS+OOS) = 24.
    assert body["planned_evaluations"] == 24
    assert "study_id" in body
    stub_storage_client.insert_validation_study.assert_called_once()


def test_launch_unknown_config_returns_404(unit_client, stub_storage_client):
    stub_storage_client.get_config_by_name.return_value = None
    resp = unit_client.post(
        "/api/validation/studies", json={"kind": "walk_forward", "config_name": "ghost"}
    )
    assert resp.status_code == 404


def test_launch_rejects_forbidden_field(unit_client, stub_storage_client):
    resp = unit_client.post(
        "/api/validation/studies",
        json={"kind": "walk_forward", "config_name": "default", "symbol": "QQQ"},
    )
    assert resp.status_code == 422


def test_list_studies(unit_client, stub_storage_client):
    stub_storage_client.list_validation_studies.return_value = SimpleNamespace(
        studies=[_study_row(), _study_row()], next_cursor=None
    )
    resp = unit_client.get("/api/validation/studies")
    assert resp.status_code == 200
    assert len(resp.json()["studies"]) == 2


def test_get_study_200_and_404(unit_client, stub_storage_client):
    row = _study_row()
    stub_storage_client.get_validation_study.return_value = row
    ok = unit_client.get(f"/api/validation/studies/{row['id']}")
    assert ok.status_code == 200
    assert ok.json()["result"]["mode"] == "rolling"

    stub_storage_client.get_validation_study.return_value = None
    missing = unit_client.get(f"/api/validation/studies/{uuid4()}")
    assert missing.status_code == 404


def test_get_status(unit_client, stub_storage_client):
    row = _study_row(status="running", progress_completed=6)
    stub_storage_client.get_validation_study.return_value = row
    resp = unit_client.get(f"/api/validation/studies/{row['id']}/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "running" and body["progress_completed"] == 6
