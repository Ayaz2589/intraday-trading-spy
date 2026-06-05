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
