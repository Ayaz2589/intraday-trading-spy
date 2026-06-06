"""Feature 018: /api/recommend/* — the DETERMINISTIC surfaces (T008 US1 health,
T018 US2 pack). These endpoints never touch the Claude analyst (FR-009)."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.api


def _point(config_name: str, i: int, expectancy_r: float) -> dict:
    return {
        "run_id": f"r-{config_name}-{i}",
        "study_id": "st1",
        "window_index": i,
        "config_name": config_name,
        "range_start": f"{2019 + i}-01-01",
        "range_end": f"{2019 + i}-06-28",
        "trades": 100,
        "net_pnl": 10.0,
        "expectancy_dollars": 0.1,
        "expectancy_r": expectancy_r,
        "pnl_std": 1.0,
        "account_value": 1000.0,
    }


def _config(cid: str, name: str) -> dict:
    return {
        "id": cid,
        "name": name,
        "strategy_id": "strat-1",
        "mode": "backtest",
        "params": {"risk": {"account_value": 1000}},
        "is_active": name == "wf-rr3",
        "description": None,
    }


EDGE = {
    "points": [_point("wf-rr3", i, -0.01 if i >= 4 else 0.03) for i in range(8)],
    "snapshot_fingerprint": "fp-edge",
}
DIST = {
    "rows": [
        {
            "config_name": "wf-rr3",
            "gate_passed": False,
            "gate_ci_low": -0.71,
            "gate_ci_high": 2.60,
            "gate_study_id": "st1",
        }
    ],
    "snapshot_fingerprint": "fp-dist",
}


class TestRecommendHealth:
    def test_returns_per_config_verdicts_with_cited_inputs(self, unit_client, stub_storage_client):
        stub_storage_client.insights_edge_timeseries.return_value = EDGE
        stub_storage_client.insights_config_distribution.return_value = DIST
        stub_storage_client.list_configs.return_value = [
            _config("c1", "wf-rr3"),
            _config("c2", "never-studied"),  # zero OOS history -> omitted
        ]
        r = unit_client.get("/api/recommend/health")
        assert r.status_code == 200
        verdicts = r.json()["verdicts"]
        assert len(verdicts) == 1
        v = verdicts[0]
        assert v["config_id"] == "c1"
        assert v["config_name"] == "wf-rr3"
        assert v["verdict"] == "failing"  # gate failed + recent median <= 0
        assert v["inputs"]["window_count"] == 8
        assert v["inputs"]["gate_passed"] is False
        # thresholds echoed from config.yaml (FR-003)
        assert v["thresholds"]["min_windows"] == 6
        assert v["thresholds"]["recent_windows"] == 4

    def test_never_touches_the_claude_analyst(self, unit_client, stub_storage_client):
        stub_storage_client.insights_edge_timeseries.return_value = EDGE
        stub_storage_client.insights_config_distribution.return_value = DIST
        stub_storage_client.list_configs.return_value = [_config("c1", "wf-rr3")]
        r = unit_client.get("/api/recommend/health")
        assert r.status_code == 200
        stub_storage_client.get_insight_settings.assert_not_called()
        stub_storage_client.get_latest_insight_analysis.assert_not_called()
        stub_storage_client.insert_insight_analysis.assert_not_called()

    def test_empty_archive_yields_empty_verdicts(self, unit_client, stub_storage_client):
        stub_storage_client.insights_edge_timeseries.return_value = {
            "points": [], "snapshot_fingerprint": "empty",
        }
        stub_storage_client.insights_config_distribution.return_value = {
            "rows": [], "snapshot_fingerprint": "empty",
        }
        stub_storage_client.list_configs.return_value = [_config("c1", "wf-rr3")]
        r = unit_client.get("/api/recommend/health")
        assert r.status_code == 200
        assert r.json()["verdicts"] == []


# ---- T018 (US2): GET /api/recommend/pack — deterministic, LLM-free ----------

RR = "strategy.vwap_pullback.target.risk_reward"

PACK_CONFIGS = [
    {
        "id": "c1", "name": "wf-rr3", "strategy_id": "strat-1", "mode": "backtest",
        "params": {"risk": {"account_value": 1000, "max_risk_per_trade_pct": 0.1},
                   "strategy": {"vwap_pullback": {"target": {"risk_reward": 3.0}}}},
        "is_active": True, "description": None,
    },
    {
        "id": "c2", "name": "default", "strategy_id": "strat-1", "mode": "backtest",
        "params": {"risk": {"account_value": 1000, "max_risk_per_trade_pct": 0.1},
                   "strategy": {"vwap_pullback": {"target": {"risk_reward": 2.0}}}},
        "is_active": False, "description": None,
    },
]


def _stub_pack_storage(stub):
    stub.get_config_by_id.return_value = PACK_CONFIGS[0]
    stub.list_configs.return_value = PACK_CONFIGS
    stub.insights_edge_timeseries.return_value = EDGE
    stub.insights_config_distribution.return_value = DIST
    stub.list_sensitivity_surfaces.return_value = []
    stub.recommendation_trial_counts.return_value = {"drafted": 0, "validated": 0}


class TestRecommendPack:
    def test_returns_pack_candidates_counts_and_fingerprint(self, unit_client, stub_storage_client):
        _stub_pack_storage(stub_storage_client)
        r = unit_client.get("/api/recommend/pack", params={"config_id": "c1"})
        assert r.status_code == 200
        body = r.json()
        assert body["pack"]["config_name"] == "wf-rr3"
        assert isinstance(body["candidates"], list)
        assert body["trial_counts"] == {"drafted": 0, "validated": 0}
        assert isinstance(body["snapshot_fingerprint"], str) and body["snapshot_fingerprint"]
        # candidates carry ranks and whitelisted changes only
        for c in body["candidates"]:
            assert c["klass"] in ("knob_delta", "gather_evidence", "stop_tuning")
            for ch in c["changes"]:
                assert ch["knob_path"].startswith(("risk.", "strategy."))

    def test_unknown_config_is_404(self, unit_client, stub_storage_client):
        _stub_pack_storage(stub_storage_client)
        stub_storage_client.get_config_by_id.return_value = None
        r = unit_client.get("/api/recommend/pack", params={"config_id": "nope"})
        assert r.status_code == 404

    def test_missing_config_id_is_422(self, unit_client, stub_storage_client):
        r = unit_client.get("/api/recommend/pack")
        assert r.status_code == 422

    def test_pack_never_touches_the_claude_analyst(self, unit_client, stub_storage_client):
        _stub_pack_storage(stub_storage_client)
        r = unit_client.get("/api/recommend/pack", params={"config_id": "c1"})
        assert r.status_code == 200
        stub_storage_client.get_insight_settings.assert_not_called()
        stub_storage_client.insert_insight_analysis.assert_not_called()
