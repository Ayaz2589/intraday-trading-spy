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


def test_launch_sensitivity_returns_202_and_planned(unit_client, stub_storage_client):
    stub_storage_client.get_config_by_name.return_value = {"params": {}}
    resp = unit_client.post(
        "/api/validation/studies",
        json={
            "kind": "sensitivity",
            "config_name": "default",
            "grid": [{"knob": "strategy.vwap_pullback.target.risk_reward", "values": [1.5, 2.0, 2.5]}],
        },
    )
    assert resp.status_code == 202, resp.text
    assert resp.json()["planned_evaluations"] == 3


def test_launch_sensitivity_three_dims_rejected(unit_client, stub_storage_client):
    stub_storage_client.get_config_by_name.return_value = {"params": {}}
    resp = unit_client.post(
        "/api/validation/studies",
        json={
            "kind": "sensitivity",
            "config_name": "default",
            "grid": [
                {"knob": "a", "values": [1]},
                {"knob": "b", "values": [1]},
                {"knob": "c", "values": [1]},
            ],
        },
    )
    # ≥3-D is a business-rule rejection (raise_validation_error → 400), distinct
    # from a malformed-schema 422.
    assert resp.status_code == 400


def test_launch_sensitivity_requires_grid(unit_client, stub_storage_client):
    stub_storage_client.get_config_by_name.return_value = {"params": {}}
    resp = unit_client.post(
        "/api/validation/studies", json={"kind": "sensitivity", "config_name": "default"}
    )
    assert resp.status_code == 422  # schema: grid required for sensitivity


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


def test_significance_404_for_unknown_run(unit_client, stub_storage_client):
    stub_storage_client.get_run.return_value = None
    resp = unit_client.post("/api/validation/significance", json={"run_id": str(uuid4())})
    assert resp.status_code == 404


def test_significance_happy(unit_client, monkeypatch):
    from intraday_trade_spy.models import BootstrapCI, SignificanceResult

    canned = SignificanceResult(
        confidence=0.95,
        bootstrap=[BootstrapCI(statistic="expectancy_dollars", point=1.2, low=-0.3, high=2.7)],
        permutation_metric="total_net_pnl_dollars", observed=246.0,
        p_value=0.03, alpha=0.05, significant=True,
        bootstrap_iterations=1000, permutation_iterations=1000, seed=20260603,
    )
    monkeypatch.setattr(
        "intraday_trade_spy.api.routers.validation.run_significance_for_run",
        lambda **kw: canned,
    )
    resp = unit_client.post("/api/validation/significance", json={"run_id": str(uuid4())})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["significant"] is True and body["p_value"] == 0.03


def test_lockbox_status_unspent(unit_client, stub_storage_client):
    stub_storage_client.get_lockbox_ledger.return_value = []
    resp = unit_client.get("/api/validation/lockbox")
    assert resp.status_code == 200
    assert resp.json()["state"] == "unspent"


def test_lockbox_run_happy(unit_client, monkeypatch):
    monkeypatch.setattr(
        "intraday_trade_spy.api.routers.validation.run_lockbox",
        lambda **kw: {
            "state": "spent", "contaminated": False, "config_fingerprint": "fp",
            "run_id": None, "summary": {"total_net_pnl_dollars": 42.0},
        },
    )
    resp = unit_client.post("/api/validation/lockbox/run", json={"config_name": "default"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["state"] == "spent"


def test_lockbox_run_blocked_409(unit_client, monkeypatch):
    from intraday_trade_spy.api.validation_lifecycle import LockboxAlreadySpent

    def _boom(**kw):
        raise LockboxAlreadySpent(spent_fingerprint="fpA", spent_run_id=None)

    monkeypatch.setattr("intraday_trade_spy.api.routers.validation.run_lockbox", _boom)
    resp = unit_client.post(
        "/api/validation/lockbox/run", json={"config_name": "other", "override": False}
    )
    assert resp.status_code == 409
    assert resp.json()["detail"]["error"] == "lockbox_already_spent"


def test_get_status(unit_client, stub_storage_client):
    row = _study_row(status="running", progress_completed=6)
    stub_storage_client.get_validation_study.return_value = row
    resp = unit_client.get(f"/api/validation/studies/{row['id']}/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "running" and body["progress_completed"] == 6
