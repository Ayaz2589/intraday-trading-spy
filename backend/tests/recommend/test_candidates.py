"""Feature 018 T017 (US2): deterministic candidate generation — three classes
(knob_delta / gather_evidence / stop_tuning), whitelist-guaranteed deltas
(FR-006), documented score with stable ordering (SC-002), stop-tuning fires
whenever every family gate failed (SC-006)."""

from __future__ import annotations

import json
import math

import pytest

from intraday_trade_spy.config import InsightsHealthConfig, InsightsRecommendConfig
from intraday_trade_spy.recommend.candidates import generate_candidates
from intraday_trade_spy.recommend.evidence import build_evidence_pack
from intraday_trade_spy.recommend.health import compute_health
from intraday_trade_spy.validation.knobs import KNOB_REGISTRY

RR = "strategy.vwap_pullback.target.risk_reward"

RC = InsightsRecommendConfig(min_improvement_r=0.01, min_shared_windows=4, max_candidates=5)


def _params(rr: float, risk: float = 0.1) -> dict:
    return {
        "risk": {"account_value": 1000, "max_risk_per_trade_pct": risk},
        "strategy": {"vwap_pullback": {"target": {"risk_reward": rr}}},
    }


CONFIGS = [
    {"id": "c-default", "name": "default", "strategy_id": "s1", "params": _params(2.0)},
    {"id": "c-rr3", "name": "wf-rr3", "strategy_id": "s1", "params": _params(3.0)},
]


def _point(config: str, start: str, end: str, r: float) -> dict:
    return {
        "run_id": f"{config}-{start}",
        "config_name": config,
        "range_start": start,
        "range_end": end,
        "trades": 100,
        "net_pnl": r * 1000,
        "expectancy_r": r,
    }


POINTS = [
    _point("default", "2019-01-02", "2019-06-28", 0.01),
    _point("wf-rr3", "2019-01-02", "2019-06-28", 0.03),
    _point("default", "2019-07-01", "2019-12-31", 0.01),
    _point("wf-rr3", "2019-07-01", "2019-12-31", 0.03),
    _point("default", "2020-01-02", "2020-06-30", 0.02),
    _point("wf-rr3", "2020-01-02", "2020-06-30", 0.04),
    _point("default", "2020-07-01", "2020-12-31", 0.02),
    _point("wf-rr3", "2020-07-01", "2020-12-31", 0.04),
]

ALL_FAIL_GATES = [
    {"config_name": "default", "gate_passed": False, "gate_ci_low": -0.4, "gate_ci_high": 1.2},
    {"config_name": "wf-rr3", "gate_passed": False, "gate_ci_low": -0.71, "gate_ci_high": 2.6},
]

SURFACES = [
    {
        "study_id": "study-1",
        "config_name": "default",
        "surface": {
            "metric_name": "expectancy_r",
            "knobs": [RR],
            "axes": {RR: [1.5, 2.0, 2.5, 3.0]},
            "points": [
                {"coords": {RR: 1.5}, "metric": 0.0, "trade_count": 50, "low_confidence": False, "run_id": "p0"},
                {"coords": {RR: 2.0}, "metric": 0.005, "trade_count": 50, "low_confidence": False, "run_id": "p1"},
                {"coords": {RR: 2.5}, "metric": 0.03, "trade_count": 50, "low_confidence": False, "run_id": "p2"},
                {"coords": {RR: 3.0}, "metric": 0.032, "trade_count": 50, "low_confidence": False, "run_id": "p3"},
            ],
            "segment": "validation",
        },
    }
]


def _pack(*, points=POINTS, dist_rows=ALL_FAIL_GATES, surfaces=SURFACES, configs=CONFIGS):
    target = configs[0]
    health = compute_health(
        config_id=target["id"], config_name=target["name"], strategy_id="s1",
        windows=[p for p in points if p["config_name"] == target["name"]],
        gate=None, thresholds=InsightsHealthConfig(),
    )
    return build_evidence_pack(
        config=target, configs=configs, points=points, dist_rows=dist_rows,
        surfaces=surfaces, regimes=[], health=health,
        trial_counts={"drafted": 0, "validated": 0},
    )


def _candidates(**over):
    pack = over.pop("pack", None) or _pack(**{k: v for k, v in over.items() if k in
                                              ("points", "dist_rows", "surfaces", "configs")})
    configs = over.get("configs", CONFIGS)
    return generate_candidates(pack=pack, configs=configs, thresholds=RC)


class TestKnobDeltaCandidates:
    def test_plateau_candidate_from_surface_with_score(self):
        out = _candidates()
        deltas = [c for c in out if c["klass"] == "knob_delta"]
        assert deltas, "expected at least one knob-delta candidate"
        # rr 2.5: improvement = nb(2.5) - nb(2.0); evidence_n = 3 grid points
        c25 = next(c for c in deltas if c["changes"] == [{"knob_path": RR, "value": 2.5}])
        nb_25 = (0.005 + 0.03 + 0.032) / 3
        nb_20 = (0.0 + 0.005 + 0.03) / 3
        assert c25["score"] == pytest.approx((nb_25 - nb_20) * math.log2(1 + 3))
        assert c25["already_tried"] is None
        assert len(c25["evidence"]) >= 1

    def test_already_tried_flagged_with_config_reference(self):
        out = _candidates()
        # rr -> 3.0 lands exactly on wf-rr3's knob set
        tried = [c for c in out if c.get("already_tried")]
        assert tried, "expected the rr=3.0 candidate to be flagged already tried"
        assert tried[0]["already_tried"]["config_name"] == "wf-rr3"

    def test_transfer_candidate_from_matched_windows(self):
        out = _candidates(surfaces=[])  # no surfaces -> transfer is the only source
        deltas = [c for c in out if c["klass"] == "knob_delta"]
        assert len(deltas) == 1
        c = deltas[0]
        assert c["changes"] == [{"knob_path": RR, "value": 3.0}]
        # medians: other 0.035, target 0.015 -> improvement 0.02, evidence 4 windows
        assert c["score"] == pytest.approx(0.02 * math.log2(1 + 4))
        assert c["already_tried"]["config_name"] == "wf-rr3"

    def test_every_emitted_change_is_whitelisted_and_in_bounds(self):
        out = _candidates()
        for c in out:
            for ch in c["changes"]:
                spec = KNOB_REGISTRY[ch["knob_path"]]
                assert spec.min <= ch["value"] <= spec.max

    def test_ranked_by_score_then_lexicographic_and_deterministic(self):
        a, b = _candidates(), _candidates()
        assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
        scores = [c["score"] for c in a if c["klass"] == "knob_delta"]
        assert scores == sorted(scores, reverse=True)
        assert [c["rank"] for c in a] == list(range(1, len(a) + 1))


class TestRecommendationClasses:
    def test_stop_tuning_when_every_family_gate_failed(self):
        out = _candidates()
        stops = [c for c in out if c["klass"] == "stop_tuning"]
        assert len(stops) == 1
        assert "no setting" in stops[0]["narrative_hint"].lower()
        assert stops[0]["changes"] == []

    def test_no_stop_tuning_when_a_gate_is_missing_or_passed(self):
        gates = [
            {"config_name": "default", "gate_passed": False, "gate_ci_low": -0.4, "gate_ci_high": 1.2},
            {"config_name": "wf-rr3", "gate_passed": None, "gate_ci_low": None, "gate_ci_high": None},
        ]
        out = _candidates(dist_rows=gates)
        assert not [c for c in out if c["klass"] == "stop_tuning"]

    def test_never_studied_config_gets_walk_forward_gather_evidence(self):
        configs = [
            {"id": "c-new", "name": "fresh", "strategy_id": "s1", "params": _params(2.0)},
        ] + CONFIGS
        pack = _pack(points=POINTS, configs=configs)  # target 'fresh' has no points
        out = generate_candidates(pack=pack, configs=configs, thresholds=RC)
        gathers = [c for c in out if c["klass"] == "gather_evidence"]
        assert gathers
        assert "walk-forward" in gathers[0]["narrative_hint"].lower()
        assert not [c for c in out if c["klass"] == "knob_delta"]

    def test_thin_pack_recommends_sensitivity_study(self):
        # windows exist but no surfaces and no transfer evidence (other config
        # shares too few windows) -> gather_evidence names the missing study.
        points = POINTS[:5]  # only 2 shared windows < min_shared_windows
        out = _candidates(points=points, surfaces=[])
        gathers = [c for c in out if c["klass"] == "gather_evidence"]
        assert gathers
        assert "sensitivity" in gathers[0]["narrative_hint"].lower()
        assert not [c for c in out if c["klass"] == "knob_delta"]
