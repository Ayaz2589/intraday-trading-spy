"""Feature 015 — POST /api/validation/monte-carlo HTTP contract (US1 stage:
shuffle + reproducibility metadata; cone/terminal/ruin arrive in US2/US3).

unit_client + MagicMock storage. Errors follow the project convention:
domain validation problems are 400 {"error": "validation_error", message}
via errors.raise_validation_error (contracts/api.md updated from 422).
"""

from types import SimpleNamespace
from uuid import uuid4

import pytest

pytestmark = pytest.mark.api


def _run_row(**over):
    row = {
        "id": str(uuid4()),
        "status": "finished",
        "range_start": "2024-01-02",
        "range_end": "2024-06-28",
        "config_snapshot": {"risk": {"account_value": 1000.0}},
    }
    row.update(over)
    return row


def _trades(pnls):
    return [
        {"pnl": p, "entry_at": f"2024-01-{i + 2:02d}T10:00:00Z"}
        for i, p in enumerate(pnls)
    ]


def _arm(stub, *, run_row=None, pnls=(100.0, -200.0, -100.0, 300.0)):
    stub.get_run.return_value = _run_row() if run_row is None else run_row
    stub.list_trades.return_value = SimpleNamespace(
        trades=_trades(list(pnls)), next_cursor=None
    )


def test_monte_carlo_happy_path_us1_shape(unit_client, stub_storage_client):
    _arm(stub_storage_client)
    resp = unit_client.post(
        "/api/validation/monte-carlo", json={"run_id": str(uuid4())}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # US1-stage shape: shuffle + reproducibility metadata.
    s = body["shuffle"]
    for key in ("max_drawdown_pct", "max_drawdown_dollars",
                "longest_losing_streak", "longest_underwater_trades"):
        dist = s[key]
        assert dist["p5"] <= dist["p25"] <= dist["p50"] <= dist["p75"] <= dist["p95"]
    # Hand-computed observed values for the fixture trade order.
    assert s["max_drawdown_dollars"]["observed"] == pytest.approx(300.0)
    assert s["longest_losing_streak"]["observed"] == 2
    # Reproducibility metadata from the shipped config.yaml.
    assert body["iterations"] == 2000
    assert body["seed"] == 20260604
    assert body["trade_count"] == 4
    assert body["starting_equity"] == pytest.approx(1000.0)
    assert body["low_confidence"] is True  # 4 < 30


def test_monte_carlo_404_for_unknown_run(unit_client, stub_storage_client):
    stub_storage_client.get_run.return_value = None
    resp = unit_client.post(
        "/api/validation/monte-carlo", json={"run_id": str(uuid4())}
    )
    assert resp.status_code == 404


def test_monte_carlo_400_for_single_trade(unit_client, stub_storage_client):
    _arm(stub_storage_client, pnls=(42.0,))
    resp = unit_client.post(
        "/api/validation/monte-carlo", json={"run_id": str(uuid4())}
    )
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert detail["error"] == "validation_error"
    assert "at least 2" in detail["message"]


def test_monte_carlo_400_for_no_stored_trades(unit_client, stub_storage_client):
    _arm(stub_storage_client, pnls=())
    resp = unit_client.post(
        "/api/validation/monte-carlo", json={"run_id": str(uuid4())}
    )
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert detail["error"] == "validation_error"
    assert "per-trade" in detail["message"]


def test_monte_carlo_400_for_unreadable_snapshot(unit_client, stub_storage_client):
    _arm(stub_storage_client, run_row=_run_row(config_snapshot={}))
    resp = unit_client.post(
        "/api/validation/monte-carlo", json={"run_id": str(uuid4())}
    )
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert detail["error"] == "validation_error"
    assert "snapshot" in detail["message"]


def test_monte_carlo_is_deterministic_across_calls(unit_client, stub_storage_client):
    _arm(stub_storage_client)
    run_id = str(uuid4())
    a = unit_client.post("/api/validation/monte-carlo", json={"run_id": run_id})
    b = unit_client.post("/api/validation/monte-carlo", json={"run_id": run_id})
    assert a.status_code == b.status_code == 200
    assert a.content == b.content  # byte-identical (FR-005)


def test_monte_carlo_has_no_side_effects(unit_client, stub_storage_client):
    """Amended FR-011: read-only — no storage writes, no journal entries."""
    _arm(stub_storage_client)
    resp = unit_client.post(
        "/api/validation/monte-carlo", json={"run_id": str(uuid4())}
    )
    assert resp.status_code == 200
    for call in stub_storage_client.method_calls:
        name = call[0]
        assert name.startswith(("get_", "list_")), (
            f"unexpected non-read storage call during monte carlo: {name}"
        )


# ---- T016 (US2): response includes the cone + terminal equity ---------------


def test_monte_carlo_response_includes_cone_and_terminal(unit_client, stub_storage_client):
    _arm(stub_storage_client)
    resp = unit_client.post(
        "/api/validation/monte-carlo", json={"run_id": str(uuid4())}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    cone = body["cone"]
    assert cone["horizon_trades"] == 4
    assert 1 <= len(cone["steps"]) <= 200
    first, last = cone["steps"][0], cone["steps"][-1]
    assert first["trade_index"] == 1 and last["trade_index"] == 4
    for step in cone["steps"]:
        assert step["p5"] <= step["p25"] <= step["p50"] <= step["p75"] <= step["p95"]
    t = body["terminal_equity"]
    assert t["observed"] == pytest.approx(1000.0 + 100.0)  # start + sum(pnls)


# ---- T021 (US3): response includes ruin probabilities -----------------------


def test_monte_carlo_response_includes_ruin(unit_client, stub_storage_client):
    _arm(stub_storage_client)
    resp = unit_client.post(
        "/api/validation/monte-carlo", json={"run_id": str(uuid4())}
    )
    assert resp.status_code == 200, resp.text
    ruin = resp.json()["ruin"]
    # config.yaml defaults: thresholds 5/10/20, in order, monotone.
    assert [r["threshold_pct"] for r in ruin] == [5.0, 10.0, 20.0]
    probs = [r["probability"] for r in ruin]
    assert all(0.0 <= p <= 1.0 for p in probs)
    assert probs[0] >= probs[1] >= probs[2]
