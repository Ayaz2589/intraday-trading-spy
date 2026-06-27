"""Feature 025 — config summary HTTP contract.

GET /api/configs must return, on each ConfigView, a non-empty `summary` plus a
`highlights` array, derived from `params`, WITHOUT touching the provenance
`description`. unit_client + MagicMock storage (mirrors test_configs_description).
"""

import pytest

pytestmark = pytest.mark.api

FULL_PARAMS = {
    "strategy": {
        "opening_range": {"minutes": 15},
        "vwap_pullback": {
            "max_distance_from_vwap_pct": 0.5,
            "stop": {"buffer_pct": 0.2},
            "target": {"risk_reward": 2.0},
            "entry_window": {
                "start_minutes_after_open": 0,
                "end_minutes_after_open": 390,
            },
        },
    }
}

ROW = {
    "id": "11111111-1111-1111-1111-111111111111",
    "name": "auto09-c3-buffer_pct0.2",
    "mode": "backtest",
    "timeframe": "5m",
    "strategy_id": "22222222-2222-2222-2222-222222222222",
    "params": FULL_PARAMS,
    "is_active": False,
    "description": "Drafted from Claude analysis abcd · experiment 3",
}


def test_list_includes_summary_and_highlights(unit_client, stub_storage_client):
    stub_storage_client.list_configs.return_value = [ROW]
    resp = unit_client.get("/api/configs")
    assert resp.status_code == 200, resp.text
    cfg = resp.json()["configs"][0]
    assert cfg["summary"] == (
        "VWAP pullback · ≤0.5% from VWAP · 0.2% stop buffer · 2:1 R:R "
        "· 15-min opening range · all-day entry"
    )
    assert isinstance(cfg["highlights"], list) and len(cfg["highlights"]) == 5
    assert cfg["highlights"][0] == {
        "label": "max distance from VWAP (%)",
        "value": "≤0.5%",
    }


def test_summary_does_not_touch_description(unit_client, stub_storage_client):
    stub_storage_client.list_configs.return_value = [ROW]
    cfg = unit_client.get("/api/configs").json()["configs"][0]
    # provenance is unchanged and is NOT the summary
    assert cfg["description"] == ROW["description"]
    assert cfg["summary"] != cfg["description"]


def test_empty_params_still_returns_family_summary(unit_client, stub_storage_client):
    stub_storage_client.list_configs.return_value = [{**ROW, "params": {}}]
    cfg = unit_client.get("/api/configs").json()["configs"][0]
    assert cfg["summary"] == "VWAP pullback"
    assert cfg["highlights"] == []
    # name still present (augment, not replace)
    assert cfg["name"] == ROW["name"]
