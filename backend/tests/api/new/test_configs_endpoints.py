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


# ---------- Feature 012: config management endpoints ----------

from intraday_trade_spy.storage.client import ConfigNameConflict, LastConfigError  # noqa: E402


def test_list_configs_exposes_is_active(unit_client, stub_storage_client):
    row = {**_make_config_row("default"), "is_active": True}
    stub_storage_client.list_configs.return_value = [row]
    body = unit_client.get("/api/configs").json()
    assert body["configs"][0]["is_active"] is True


def test_create_config_scratch(unit_client, stub_storage_client):
    created = {**_make_config_row("tighter"), "is_active": False}
    stub_storage_client.create_config.return_value = created
    r = unit_client.post("/api/configs", json={"name": "tighter", "source": "scratch"})
    assert r.status_code == 201, r.text
    assert r.json()["name"] == "tighter"
    assert stub_storage_client.create_config.called


def test_create_config_from_preset(unit_client, stub_storage_client):
    stub_storage_client.list_presets.return_value = [
        {"name": "low-risk", "description": "d", "params": {"risk": {}, "strategy": {}}}
    ]
    stub_storage_client.create_config.return_value = {**_make_config_row("lr"), "is_active": False}
    r = unit_client.post("/api/configs", json={"name": "lr", "source": "preset", "preset_name": "low-risk"})
    assert r.status_code == 201, r.text


def test_create_config_unknown_preset_404(unit_client, stub_storage_client):
    stub_storage_client.list_presets.return_value = []
    r = unit_client.post("/api/configs", json={"name": "x", "source": "preset", "preset_name": "ghost"})
    assert r.status_code == 404


def test_create_config_duplicate_source(unit_client, stub_storage_client):
    stub_storage_client.duplicate_config.return_value = {**_make_config_row("copy"), "is_active": False}
    r = unit_client.post(
        "/api/configs",
        json={"name": "copy", "source": "duplicate", "from_config_id": str(uuid4())},
    )
    assert r.status_code == 201, r.text
    assert stub_storage_client.duplicate_config.called


def test_create_config_name_conflict_400(unit_client, stub_storage_client):
    stub_storage_client.create_config.side_effect = ConfigNameConflict("name in use")
    r = unit_client.post("/api/configs", json={"name": "default", "source": "scratch"})
    assert r.status_code == 400


def test_create_config_rejects_live(unit_client, stub_storage_client):
    # Constitution V: a config path can never enable live trading.
    r = unit_client.post(
        "/api/configs",
        json={"name": "x", "source": "scratch", "live_auto_enabled": True},
    )
    assert r.status_code == 422


def test_activate_config(unit_client, stub_storage_client):
    row = {**_make_config_row("aggressive"), "is_active": True}
    stub_storage_client.get_config_by_id.return_value = row
    stub_storage_client.set_active_config.return_value = row
    r = unit_client.post(f"/api/configs/{row['id']}/activate")
    assert r.status_code == 200
    assert r.json()["is_active"] is True


def test_rename_via_patch(unit_client, stub_storage_client):
    existing = _make_config_row("old")
    renamed = {**existing, "name": "new"}
    stub_storage_client.get_config_by_id.return_value = existing
    stub_storage_client.rename_config.return_value = renamed
    r = unit_client.patch(f"/api/configs/{existing['id']}", json={"name": "new"})
    assert r.status_code == 200
    assert r.json()["name"] == "new"


def test_delete_config(unit_client, stub_storage_client):
    cid = uuid4()
    stub_storage_client.delete_config.return_value = None
    r = unit_client.delete(f"/api/configs/{cid}")
    assert r.status_code == 200
    assert r.json()["deleted"] == str(cid)


def test_delete_last_config_409(unit_client, stub_storage_client):
    stub_storage_client.delete_config.side_effect = LastConfigError("only one left")
    r = unit_client.delete(f"/api/configs/{uuid4()}")
    assert r.status_code == 409
    assert r.json()["detail"]["error"] == "last_config"


def test_list_presets(unit_client, stub_storage_client):
    stub_storage_client.list_presets.return_value = [
        {
            "name": "aggressive",
            "label": "Aggressive — bigger swings",
            "description": "bigger risk",
            "params": {"risk": {}, "strategy": {}},
        }
    ]
    r = unit_client.get("/api/configs/presets")
    assert r.status_code == 200
    assert r.json()["presets"][0]["name"] == "aggressive"
    assert r.json()["presets"][0]["label"] == "Aggressive — bigger swings"


# ---- Feature 018 (T032 US3): provenance writes the trial ledger ---------------


def test_create_config_with_provenance_writes_trial_row(unit_client, stub_storage_client):
    created = {**_make_config_row("default-exp-1"), "is_active": False}
    stub_storage_client.create_config.return_value = created
    r = unit_client.post(
        "/api/configs",
        json={
            "name": "default-exp-1",
            "source": "scratch",
            "params": {"risk": {}, "strategy": {}},
            "description": "Drafted from Claude analysis ia-1",
            "provenance": {"analysis_id": "ia-1", "source": "claude"},
        },
    )
    assert r.status_code == 201, r.text
    kwargs = stub_storage_client.insert_recommendation_trial.call_args.kwargs
    assert kwargs["config_id"] == created["id"]
    assert kwargs["config_name"] == "default-exp-1"
    assert kwargs["strategy_id"] == created["strategy_id"]
    assert kwargs["analysis_id"] == "ia-1"
    assert kwargs["source"] == "claude"


def test_create_config_deterministic_provenance_allows_null_analysis(
    unit_client, stub_storage_client
):
    created = {**_make_config_row("default-exp-2"), "is_active": False}
    stub_storage_client.create_config.return_value = created
    r = unit_client.post(
        "/api/configs",
        json={
            "name": "default-exp-2",
            "source": "scratch",
            "provenance": {"analysis_id": None, "source": "deterministic"},
        },
    )
    assert r.status_code == 201, r.text
    kwargs = stub_storage_client.insert_recommendation_trial.call_args.kwargs
    assert kwargs["analysis_id"] is None
    assert kwargs["source"] == "deterministic"


def test_create_config_without_provenance_writes_no_trial(unit_client, stub_storage_client):
    created = {**_make_config_row("plain"), "is_active": False}
    stub_storage_client.create_config.return_value = created
    r = unit_client.post("/api/configs", json={"name": "plain", "source": "scratch"})
    assert r.status_code == 201, r.text
    stub_storage_client.insert_recommendation_trial.assert_not_called()


def test_create_config_rejects_bad_provenance_source(unit_client, stub_storage_client):
    r = unit_client.post(
        "/api/configs",
        json={
            "name": "x", "source": "scratch",
            "provenance": {"analysis_id": None, "source": "robot"},
        },
    )
    assert r.status_code == 422
