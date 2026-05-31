"""GET /api/configs + PATCH /api/configs/{id} tests."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest


pytestmark = pytest.mark.api

TEST_USER_ID = UUID("11111111-1111-1111-1111-111111111111")


def _make_config_row(name: str = "default") -> dict:
    return {
        "id": str(uuid4()),
        "user_id": str(TEST_USER_ID),
        "strategy_id": str(uuid4()),
        "name": name,
        "mode": "backtest",
        "timeframe": "5m",
        "live_auto_enabled": False,
        "params": {
            "risk": {
                "account_value": 25000,
                "max_risk_per_trade_pct": 0.1,
                "max_position_value_pct": 100,
                "max_consecutive_losses": 2,
            },
            "strategy": {
                "enabled_setup": "vwap_pullback_long",
                "opening_range": {"minutes": 15},
                "vwap_pullback": {
                    "max_distance_from_vwap_pct": 0.25,
                    "stop": {"buffer_pct": 0.05},
                    "target": {"risk_reward": 2.0},
                },
            },
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def test_list_configs_returns_user_configs(unit_client, stub_storage_client):
    stub_storage_client.list_configs.return_value = [_make_config_row("default")]
    r = unit_client.get("/api/configs")
    assert r.status_code == 200
    body = r.json()
    assert "configs" in body
    assert len(body["configs"]) == 1
    assert body["configs"][0]["name"] == "default"
    assert body["configs"][0]["params"]["risk"]["account_value"] == 25000


def test_patch_config_updates_params(unit_client, stub_storage_client):
    existing = _make_config_row("default")
    updated = {**existing, "params": {**existing["params"], "risk": {**existing["params"]["risk"], "account_value": 50000}}}
    stub_storage_client.get_config_by_id.return_value = existing
    stub_storage_client.update_config.return_value = updated

    r = unit_client.patch(
        f"/api/configs/{existing['id']}",
        json={"params": updated["params"]},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["params"]["risk"]["account_value"] == 50000

    called = stub_storage_client.update_config.call_args.kwargs
    assert called["config_id"] == UUID(existing["id"])
    assert called["params"]["risk"]["account_value"] == 50000


def test_patch_config_404_when_not_found(unit_client, stub_storage_client):
    stub_storage_client.get_config_by_id.return_value = None
    r = unit_client.patch(
        f"/api/configs/{uuid4()}",
        json={"params": {}},
    )
    assert r.status_code == 404
