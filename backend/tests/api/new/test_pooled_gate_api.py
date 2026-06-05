"""Feature 016 — POST /api/validation/studies/{id}/pooled-gate HTTP contract.

unit_client + MagicMock storage. Children are resolved from the study
result's own WindowMetrics (out_of_sample.run_id where persisted) — the same
references that power 014 drill-down. The full-gate task NEVER writes study
progress/status fields (analyze I1).
"""

from types import SimpleNamespace
from uuid import uuid4

import pytest

pytestmark = pytest.mark.api

W0_PNLS = [10.0, -5.0, 8.0, 12.0, -3.0, 7.0]
W1_PNLS = [6.0, -2.0, 9.0, 4.0]


def _window(idx, run_id, persisted=True):
    return {
        "window_index": idx,
        "in_sample": {"run_id": str(uuid4()), "persisted": persisted, "segment": "train"},
        "out_of_sample": {"run_id": run_id, "persisted": persisted, "segment": "validation"},
        "gap": {},
    }


def _study_row(*, kind="walk_forward", windows=None, status="finished", extra_result=None):
    result = {"mode": "rolling", "mean_oos": {"expectancy_dollars": 1.0}}
    if windows is not None:
        result["windows"] = windows
    if extra_result:
        result.update(extra_result)
    return {
        "id": str(uuid4()),
        "kind": kind,
        "status": status,
        "params": {"config_name": "wf-rr3"},
        "progress_completed": 4,
        "progress_total": 4,
        "result": result,
        "failure_reason": None,
        "created_at": "2026-06-05T00:00:00Z",
    }


def _trades(pnls):
    return [
        {"pnl": p, "r_multiple": p / 10.0, "entry_at": f"2024-01-{i + 2:02d}T10:00:00Z"}
        for i, p in enumerate(pnls)
    ]


def _arm(stub, *, study=None, child_pnls=None, account_values=None):
    """Wire get_validation_study + per-child get_run/list_trades."""
    r0, r1 = str(uuid4()), str(uuid4())
    study = study or _study_row(windows=[_window(0, r0), _window(1, r1)])
    stub.get_validation_study.return_value = study
    pnls_by_run = dict(zip([r0, r1], child_pnls or [W0_PNLS, W1_PNLS]))
    accounts = account_values or [1000.0, 1000.0]
    acct_by_run = dict(zip([r0, r1], accounts))

    def get_run(*, run_id, user_id):
        rid = str(run_id)
        if rid in acct_by_run:
            return {"id": rid, "config_snapshot": {"risk": {"account_value": acct_by_run[rid]}}}
        return {"id": rid, "config_snapshot": {"risk": {"account_value": 1000.0}}}

    def list_trades(*, run_id, user_id, limit, cursor):
        return SimpleNamespace(trades=_trades(pnls_by_run.get(str(run_id), [])), next_cursor=None)

    stub.get_run.side_effect = get_run
    stub.list_trades.side_effect = list_trades
    return study


def _post(client, study_id, mode="fast"):
    return client.post(f"/api/validation/studies/{study_id}/pooled-gate", json={"mode": mode})


def test_fast_gate_200_shape_and_rmw_persistence(unit_client, stub_storage_client):
    study = _arm(stub_storage_client)
    resp = _post(unit_client, study["id"])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["mode"] == "fast"
    assert body["pooled_trades"] == 10
    assert body["windows_total"] == 2 and body["windows_positive"] == 2
    assert body["passed"] is (body["expectancy_dollars_ci"]["low"] > 0)
    assert body["monte_carlo"]["trade_count"] == 10
    assert body["computed_at"] is not None
    # RMW: the persisted result keeps the prior keys AND gains pooled_gate.
    call = stub_storage_client.update_validation_study.call_args
    merged = call.kwargs["result"]
    assert merged["mode"] == "rolling" and "windows" in merged
    assert merged["pooled_gate"]["pooled_trades"] == 10
    # I1: the gate never touches study progress/status.
    assert call.kwargs.get("status") is None
    assert call.kwargs.get("progress_completed") is None


def test_404_unknown_study(unit_client, stub_storage_client):
    stub_storage_client.get_validation_study.return_value = None
    resp = _post(unit_client, uuid4())
    assert resp.status_code == 404


def test_400_sensitivity_study(unit_client, stub_storage_client):
    stub_storage_client.get_validation_study.return_value = _study_row(kind="sensitivity")
    resp = _post(unit_client, uuid4())
    assert resp.status_code == 400
    assert "walk-forward" in resp.json()["detail"]["message"]


def test_400_no_persisted_children_points_at_rerun(unit_client, stub_storage_client):
    study = _study_row(windows=[_window(0, str(uuid4()), persisted=False)])
    stub_storage_client.get_validation_study.return_value = study
    resp = _post(unit_client, study["id"])
    assert resp.status_code == 400
    assert "re-run" in resp.json()["detail"]["message"].lower()


def test_400_fewer_than_two_pooled_trades(unit_client, stub_storage_client):
    study = _arm(stub_storage_client, child_pnls=[[5.0], []])
    resp = _post(unit_client, study["id"])
    assert resp.status_code == 400
    assert "at least 2" in resp.json()["detail"]["message"]


def test_400_inconsistent_child_configs(unit_client, stub_storage_client):
    study = _arm(stub_storage_client, account_values=[1000.0, 25000.0])
    resp = _post(unit_client, study["id"])
    assert resp.status_code == 400
    assert "inconsistent" in resp.json()["detail"]["message"].lower()


def test_full_mode_202_then_persists_full_gate_without_touching_progress(
    unit_client, stub_storage_client, monkeypatch
):
    from intraday_trade_spy.models import BootstrapCI, SignificanceResult

    canned = SignificanceResult(
        confidence=0.95,
        bootstrap=[BootstrapCI(statistic="expectancy_dollars", point=1.0, low=0.1, high=2.0)],
        permutation_metric="total_net_pnl_dollars", observed=10.0,
        p_value=0.04, alpha=0.05, significant=True,
        bootstrap_iterations=1000, permutation_iterations=1000, seed=1,
    )
    monkeypatch.setattr(
        "intraday_trade_spy.api.validation_lifecycle.run_significance_for_run",
        lambda **kw: canned,
    )
    study = _arm(stub_storage_client)
    resp = _post(unit_client, study["id"], mode="full")
    assert resp.status_code == 202, resp.text
    assert resp.json()["status"] == "running"
    # TestClient runs background tasks before returning — final write done.
    call = stub_storage_client.update_validation_study.call_args
    gate = call.kwargs["result"]["pooled_gate"]
    assert gate["mode"] == "full"
    assert len(gate["per_window_p"]) == 2
    assert gate["per_window_p"][0]["p_value"] == pytest.approx(0.04)
    assert gate["fisher"]["df"] == 4
    # I1: never writes study status/progress.
    for c in stub_storage_client.update_validation_study.call_args_list:
        assert c.kwargs.get("status") is None
        assert c.kwargs.get("progress_completed") is None


def test_409_when_full_gate_already_running(unit_client, stub_storage_client):
    from intraday_trade_spy.api import validation_lifecycle as vl

    study = _arm(stub_storage_client)
    vl._ACTIVE_POOLED_GATES.add(str(study["id"]))
    try:
        resp = _post(unit_client, study["id"], mode="full")
        assert resp.status_code == 409
        assert resp.json()["detail"]["error"] == "pooled_gate_running"
    finally:
        vl._ACTIVE_POOLED_GATES.discard(str(study["id"]))


def test_fast_gate_deterministic_across_calls(unit_client, stub_storage_client):
    study = _arm(stub_storage_client)
    a = _post(unit_client, study["id"]).json()
    b = _post(unit_client, study["id"]).json()
    a.pop("computed_at"), b.pop("computed_at")  # the only allowed difference
    assert a == b
