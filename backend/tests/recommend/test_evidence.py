"""Feature 018 T016 (US2): evidence-pack assembly — exclusively from
persisted artifacts (FR-005), validation-segment only (FR-012), serialized
with sort_keys and a recompute-identical fingerprint (SC-002)."""

from __future__ import annotations

import json

import pytest

from intraday_trade_spy.config import InsightsHealthConfig
from intraday_trade_spy.recommend.evidence import (
    build_evidence_pack,
    knob_projection,
    pack_fingerprint,
)
from intraday_trade_spy.recommend.health import compute_health

RR = "strategy.vwap_pullback.target.risk_reward"
RISK = "risk.max_risk_per_trade_pct"

TH = InsightsHealthConfig()


def _params(rr: float, risk: float = 0.1) -> dict:
    return {
        "risk": {"account_value": 1000, "max_risk_per_trade_pct": risk},
        "strategy": {"vwap_pullback": {"target": {"risk_reward": rr}}},
        "not_a_knob": {"ignored": True},
    }


CONFIGS = [
    {"id": "c-default", "name": "default", "strategy_id": "s1", "params": _params(2.0)},
    {"id": "c-rr3", "name": "wf-rr3", "strategy_id": "s1", "params": _params(3.0)},
]

TARGET = CONFIGS[0]


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
    # four shared windows + one default-only window
    _point("default", "2019-01-02", "2019-06-28", 0.01),
    _point("wf-rr3", "2019-01-02", "2019-06-28", 0.03),
    _point("default", "2019-07-01", "2019-12-31", 0.01),
    _point("wf-rr3", "2019-07-01", "2019-12-31", 0.03),
    _point("default", "2020-01-02", "2020-06-30", 0.02),
    _point("wf-rr3", "2020-01-02", "2020-06-30", 0.04),
    _point("default", "2020-07-01", "2020-12-31", 0.02),
    _point("wf-rr3", "2020-07-01", "2020-12-31", 0.04),
    _point("default", "2021-01-04", "2021-06-30", 0.015),
]

DIST_ROWS = [
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

REGIMES = [
    {"name": "2019 grind", "start": "2019-01-01", "end": "2019-12-31"},
    {"name": "2020 volatility", "start": "2020-01-01", "end": "2020-12-31"},
]


def _health() -> dict:
    return compute_health(
        config_id="c-default", config_name="default", strategy_id="s1",
        windows=[p for p in POINTS if p["config_name"] == "default"],
        gate={"passed": False, "ci_low": -0.4, "ci_high": 1.2},
        thresholds=TH,
    )


def _pack(**over) -> dict:
    kwargs = dict(
        config=TARGET,
        configs=CONFIGS,
        points=POINTS,
        dist_rows=DIST_ROWS,
        surfaces=SURFACES,
        regimes=REGIMES,
        health=_health(),
        trial_counts={"drafted": 0, "validated": 0},
    )
    kwargs.update(over)
    return build_evidence_pack(**kwargs)


class TestKnobProjection:
    def test_extracts_only_registry_paths(self):
        proj = knob_projection(_params(2.5, risk=0.2))
        assert proj[RR] == 2.5
        assert proj[RISK] == pytest.approx(0.2)
        assert all(k.startswith(("risk.", "strategy.")) for k in proj)
        assert "not_a_knob.ignored" not in proj


class TestPackAssembly:
    def test_matched_windows_group_by_range_with_registry_knob_diff(self):
        pack = _pack()
        matched = pack["matched"]
        assert len(matched) == 4  # shared windows only
        first = matched[0]
        assert first["range_start"] == "2019-01-02"
        assert first["other_config"] == "wf-rr3"
        assert first["target_expectancy_r"] == pytest.approx(0.01)
        assert first["other_expectancy_r"] == pytest.approx(0.03)
        # diff restricted to registry paths; here exactly one knob differs
        assert first["knob_diff"] == [
            {"knob_path": RR, "target_value": 2.0, "other_value": 3.0}
        ]
        assert first["transfer_eligible"] is True

    def test_regime_bleed_intersects_target_windows(self):
        pack = _pack()
        bleed = {b["regime"]: b for b in pack["regime_bleed"]}
        assert bleed["2019 grind"]["windows"] == 2
        assert bleed["2019 grind"]["median_expectancy_r"] == pytest.approx(0.01)
        assert bleed["2020 volatility"]["windows"] == 2
        assert bleed["2020 volatility"]["median_expectancy_r"] == pytest.approx(0.02)

    def test_sensitivity_summaries_carry_neighborhood_means(self):
        pack = _pack()
        sens = pack["sensitivity"]
        assert len(sens) == 1
        s = sens[0]
        assert s["knob_path"] == RR
        assert s["current_value"] == pytest.approx(2.0)
        by_value = {v["value"]: v for v in s["values"]}
        # neighborhood mean of 2.0 = mean(0.0, 0.005, 0.03)
        assert by_value[2.0]["neighborhood_mean"] == pytest.approx((0.0 + 0.005 + 0.03) / 3)
        # edge value 3.0 = mean(0.03, 0.032)
        assert by_value[3.0]["neighborhood_mean"] == pytest.approx((0.03 + 0.032) / 2)

    def test_low_confidence_points_excluded_from_neighborhoods(self):
        surfaces = json.loads(json.dumps(SURFACES))
        surfaces[0]["surface"]["points"][0]["low_confidence"] = True  # 1.5
        pack = _pack(surfaces=surfaces)
        by_value = {v["value"]: v for v in pack["sensitivity"][0]["values"]}
        assert by_value[2.0]["neighborhood_mean"] == pytest.approx((0.005 + 0.03) / 2)
        assert by_value[2.0]["evidence_n"] == 2

    def test_gates_listed_per_family_config(self):
        pack = _pack()
        assert [g["config_name"] for g in pack["gates"]] == ["default", "wf-rr3"]
        assert all(g["gate_passed"] is False for g in pack["gates"])

    def test_no_lockbox_anywhere_in_the_pack(self):
        # FR-012 audit: the pack is built from validation-segment aggregates
        # and must never reference lockbox data.
        blob = json.dumps(_pack(), sort_keys=True).lower()
        assert "lockbox" not in blob

    def test_trial_counts_embedded(self):
        pack = _pack(trial_counts={"drafted": 3, "validated": 2})
        assert pack["trial_counts"] == {"drafted": 3, "validated": 2}


class TestDeterminism:
    def test_pack_serializes_identically_on_recompute(self):
        a, b = _pack(), _pack()
        assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
        assert pack_fingerprint(a) == pack_fingerprint(b)

    def test_fingerprint_changes_when_inputs_change(self):
        a = _pack()
        moved = json.loads(json.dumps(POINTS))
        moved[0]["expectancy_r"] = 0.05
        b = _pack(points=moved, health=_health())
        assert pack_fingerprint(a) != pack_fingerprint(b)
