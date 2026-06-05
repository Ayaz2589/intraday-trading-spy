"""Feature 016 — /api/insights/* HTTP contracts (aggregates; Claude endpoints
are added in US3). unit_client + MagicMock storage."""

import pytest

pytestmark = pytest.mark.api

EDGE = {
    "points": [
        {
            "run_id": "r1", "study_id": "s1", "window_index": 0,
            "config_name": "wf-rr3", "range_start": "2019-01-02",
            "range_end": "2019-06-28", "trades": 227, "net_pnl": 118.0,
            "expectancy_dollars": 0.52, "expectancy_r": 0.018, "pnl_std": 39.5,
        }
    ],
    "snapshot_fingerprint": "abcd1234abcd1234",
}

DIST = {
    "rows": [
        {
            "config_name": "wf-rr3", "windows": 12, "windows_positive": 9,
            "pnl_q25": -50.0, "pnl_q50": 124.0, "pnl_q75": 420.0,
            "expectancy_q25": -0.3, "expectancy_q50": 0.6, "expectancy_q75": 1.9,
            "total_trades": 2607,
        }
    ],
    "snapshot_fingerprint": "abcd1234abcd1234",
}


def test_edge_timeseries_200(unit_client, stub_storage_client):
    stub_storage_client.insights_edge_timeseries.return_value = EDGE
    resp = unit_client.get("/api/insights/edge-timeseries")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["snapshot_fingerprint"] == "abcd1234abcd1234"
    assert body["points"][0]["config_name"] == "wf-rr3"
    stub_storage_client.insights_edge_timeseries.assert_called_once_with(config_name=None)


def test_edge_timeseries_config_filter(unit_client, stub_storage_client):
    stub_storage_client.insights_edge_timeseries.return_value = EDGE
    resp = unit_client.get("/api/insights/edge-timeseries?config_name=wf-rr3")
    assert resp.status_code == 200
    stub_storage_client.insights_edge_timeseries.assert_called_once_with(config_name="wf-rr3")


def test_edge_timeseries_empty(unit_client, stub_storage_client):
    stub_storage_client.insights_edge_timeseries.return_value = {
        "points": [], "snapshot_fingerprint": "empty",
    }
    resp = unit_client.get("/api/insights/edge-timeseries")
    assert resp.status_code == 200
    assert resp.json() == {"points": [], "snapshot_fingerprint": "empty"}


def test_config_distribution_200(unit_client, stub_storage_client):
    stub_storage_client.insights_config_distribution.return_value = DIST
    resp = unit_client.get("/api/insights/config-distribution")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["rows"][0]["windows_positive"] == 9
    assert body["rows"][0]["pnl_q50"] == 124.0


def test_config_distribution_empty(unit_client, stub_storage_client):
    stub_storage_client.insights_config_distribution.return_value = {
        "rows": [], "snapshot_fingerprint": "empty",
    }
    resp = unit_client.get("/api/insights/config-distribution")
    assert resp.status_code == 200
    assert resp.json()["rows"] == []


# ---- US3: Claude analysis + settings endpoints -------------------------------


def _arm_claude(stub, *, settings=None, latest=None):
    stub.get_insight_settings.return_value = settings or {
        "claude_enabled": True, "disabled_reason": None,
    }
    stub.get_latest_insight_analysis.return_value = latest
    stub.insights_edge_timeseries.return_value = {
        "points": [{"run_id": "r1", "range_start": "2019-01-02", "net_pnl": 118.0}],
        "snapshot_fingerprint": "fp-edge",
    }
    stub.insights_config_distribution.return_value = {
        "rows": [{"config_name": "wf-rr3", "windows": 12}],
        "snapshot_fingerprint": "fp-dist",
    }


STORED = {
    "id": "ia1", "scope": "insights", "scope_id": None,
    "payload_hash": "h1", "model": "claude-opus-4-8",
    "analysis": {"summary": "stored read", "findings": [], "risks": [],
                 "suggested_experiments": [], "truncated": False},
    "created_at": "2026-06-05T10:00:00Z",
}


def test_claude_analysis_post_returns_stored_view(unit_client, stub_storage_client, monkeypatch):
    _arm_claude(stub_storage_client)
    monkeypatch.setattr(
        "intraday_trade_spy.api.routers.insights.run_claude_analysis",
        lambda **kw: {**STORED, "truncated": False},
    )
    resp = unit_client.post("/api/insights/claude-analysis", json={"scope": "insights"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["analysis"]["summary"] == "stored read"


def test_claude_analysis_post_400_bad_scope(unit_client, stub_storage_client):
    _arm_claude(stub_storage_client)
    resp = unit_client.post("/api/insights/claude-analysis", json={"scope": "study"})
    # study scope without scope_id -> plain-English 400
    assert resp.status_code == 400
    assert "scope_id" in resp.json()["detail"]["message"]


def test_claude_analysis_post_409_when_paused(unit_client, stub_storage_client):
    _arm_claude(stub_storage_client,
                settings={"claude_enabled": False, "disabled_reason": "billing"})
    resp = unit_client.post("/api/insights/claude-analysis", json={"scope": "insights"})
    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"]
    assert detail["error"] == "claude_paused"
    assert detail["disabled_reason"] == "billing"


def test_claude_analysis_get_latest(unit_client, stub_storage_client):
    stub_storage_client.get_latest_insight_analysis.return_value = STORED
    resp = unit_client.get("/api/insights/claude-analysis?scope=insights")
    assert resp.status_code == 200
    assert resp.json()["id"] == "ia1"


def test_claude_analysis_get_204_when_none(unit_client, stub_storage_client):
    stub_storage_client.get_latest_insight_analysis.return_value = None
    resp = unit_client.get("/api/insights/claude-analysis?scope=insights")
    assert resp.status_code == 204


def test_claude_settings_get_lazily_upserts(unit_client, stub_storage_client):
    stub_storage_client.get_insight_settings.return_value = {
        "claude_enabled": True, "disabled_reason": None,
    }
    resp = unit_client.get("/api/insights/claude-settings")
    assert resp.status_code == 200
    body = resp.json()
    assert body["claude_enabled"] is True
    assert "configured" in body
    stub_storage_client.get_insight_settings.assert_called_once()


def test_claude_settings_patch_manual_disable_and_enable(unit_client, stub_storage_client):
    stub_storage_client.get_insight_settings.return_value = {
        "claude_enabled": False, "disabled_reason": "manual",
    }
    resp = unit_client.patch("/api/insights/claude-settings", json={"enabled": False})
    assert resp.status_code == 200
    kwargs = stub_storage_client.update_insight_settings.call_args.kwargs
    assert kwargs["claude_enabled"] is False
    assert kwargs["disabled_reason"] == "manual"

    stub_storage_client.get_insight_settings.return_value = {
        "claude_enabled": True, "disabled_reason": None,
    }
    resp = unit_client.patch("/api/insights/claude-settings", json={"enabled": True})
    assert resp.status_code == 200
    kwargs = stub_storage_client.update_insight_settings.call_args.kwargs
    assert kwargs["claude_enabled"] is True
    assert kwargs["disabled_reason"] is None
