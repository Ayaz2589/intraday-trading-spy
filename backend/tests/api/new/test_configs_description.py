"""Feature 017 — config description (provenance) HTTP contract.
unit_client + MagicMock storage."""

import pytest

pytestmark = pytest.mark.api

ROW = {
    "id": "11111111-1111-1111-1111-111111111111",
    "name": "wf-rr3-exp-1", "mode": "backtest", "timeframe": "5m",
    "strategy_id": "22222222-2222-2222-2222-222222222222",
    "params": {"risk": {"account_value": 25000.0}},
    "is_active": False,
    "description": "Drafted from Claude analysis d7e75317 · experiment 1: Test rr 2.5",
}


def test_create_with_description_passes_through_and_echoes(unit_client, stub_storage_client):
    stub_storage_client.create_config.return_value = ROW
    resp = unit_client.post("/api/configs", json={
        "name": "wf-rr3-exp-1", "source": "scratch",
        "description": ROW["description"],
    })
    assert resp.status_code in (200, 201), resp.text
    assert resp.json()["description"] == ROW["description"]
    assert stub_storage_client.create_config.call_args.kwargs["description"] == ROW["description"]


def test_create_without_description_defaults_null(unit_client, stub_storage_client):
    stub_storage_client.create_config.return_value = {**ROW, "description": None}
    resp = unit_client.post("/api/configs", json={"name": "plain", "source": "scratch"})
    assert resp.status_code in (200, 201), resp.text
    assert resp.json()["description"] is None
    assert stub_storage_client.create_config.call_args.kwargs["description"] is None


def test_description_over_500_chars_rejected(unit_client, stub_storage_client):
    resp = unit_client.post("/api/configs", json={
        "name": "x", "source": "scratch", "description": "a" * 501,
    })
    assert resp.status_code in (400, 422)
    stub_storage_client.create_config.assert_not_called()


def test_list_rows_include_description(unit_client, stub_storage_client):
    stub_storage_client.list_configs.return_value = [ROW]
    resp = unit_client.get("/api/configs")
    assert resp.status_code == 200
    assert resp.json()["configs"][0]["description"] == ROW["description"]
