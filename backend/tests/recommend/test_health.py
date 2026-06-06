"""Feature 018 T007 (US1): the health verdict rule — a pure, deterministic
function of the OOS archive (FR-001). Ordered rule:

  1. insufficient_evidence  when usable windows < min_windows
  2. failing                when latest gate failed AND recent median R <= 0
  3. degrading              when recent median < baseline median - margin
  4. ok                     otherwise

Every verdict ships its cited inputs + the thresholds used (FR-002/FR-003).
"""

import json

import pytest

from intraday_trade_spy.config import InsightsHealthConfig
from intraday_trade_spy.recommend.health import compute_health, health_for_configs

TH = InsightsHealthConfig(min_windows=6, recent_windows=4, degradation_margin_r=0.02)


def _windows(values: list[float | None], start_year: int = 2019) -> list[dict]:
    """One OOS window per value, chronologically ordered by range_start."""
    out = []
    for i, v in enumerate(values):
        out.append(
            {
                "run_id": f"r{i}",
                "config_name": "wf-rr3",
                "range_start": f"{start_year + i // 2}-{'01' if i % 2 == 0 else '07'}-01",
                "range_end": f"{start_year + i // 2}-{'06' if i % 2 == 0 else '12'}-28",
                "expectancy_r": v,
                "trades": 100,
                "net_pnl": 0.0,
            }
        )
    return out


def _verdict(values, gate=None, th=TH):
    return compute_health(
        config_id="c1",
        config_name="wf-rr3",
        strategy_id="s1",
        windows=_windows(values),
        gate=gate,
        thresholds=th,
    )


class TestVerdictRule:
    def test_insufficient_below_evidence_floor(self):
        out = _verdict([0.02] * 5)
        assert out["verdict"] == "insufficient_evidence"
        assert out["inputs"]["window_count"] == 5
        # no judgment numbers when there is no judgment
        assert out["inputs"]["recent_median_r"] is None
        assert out["inputs"]["baseline_median_r"] is None

    def test_failing_requires_gate_failed_and_recent_nonpositive(self):
        out = _verdict(
            [0.02, 0.03, 0.02, 0.04, -0.01, -0.02, 0.0, -0.01],
            gate={"passed": False, "ci_low": -0.71, "ci_high": 2.60},
        )
        assert out["verdict"] == "failing"
        assert out["inputs"]["gate_passed"] is False
        assert out["inputs"]["gate_ci_low"] == pytest.approx(-0.71)
        assert out["inputs"]["gate_ci_high"] == pytest.approx(2.60)

    def test_gate_failed_but_recent_positive_is_not_failing(self):
        # recent median 0.015 > 0 -> failing cannot fire; the big drop from
        # baseline makes it degrading instead.
        out = _verdict(
            [0.06, 0.06, 0.07, 0.07, 0.01, 0.01, 0.02, 0.02],
            gate={"passed": False, "ci_low": -0.5, "ci_high": 1.0},
        )
        assert out["verdict"] == "degrading"

    def test_degrading_without_any_gate(self):
        out = _verdict([0.05, 0.06, 0.05, 0.07, 0.01, 0.0, 0.02, 0.01], gate=None)
        assert out["verdict"] == "degrading"
        assert out["inputs"]["gate_passed"] is None

    def test_ok_when_recent_tracks_baseline(self):
        out = _verdict([0.03] * 8, gate={"passed": True, "ci_low": 0.1, "ci_high": 0.9})
        assert out["verdict"] == "ok"

    def test_degrading_boundary_is_strict(self):
        # baseline median 0.03, recent median 0.01, margin 0.02:
        # 0.01 < (0.03 - 0.02) is False -> ok, not degrading.
        out = _verdict([0.05, 0.05, 0.05, 0.05, 0.01, 0.01, 0.01, 0.01])
        assert out["verdict"] == "ok"

    def test_windows_without_expectancy_are_excluded(self):
        # 8 raw windows but 3 carry no expectancy_r -> 5 usable -> insufficient.
        out = _verdict([0.02, None, 0.03, None, 0.02, 0.03, None, 0.02])
        assert out["verdict"] == "insufficient_evidence"
        assert out["inputs"]["window_count"] == 5


class TestCitedInputsAndDeterminism:
    def test_thresholds_echoed(self):
        out = _verdict([0.03] * 8)
        assert out["thresholds"] == {
            "min_windows": 6,
            "recent_windows": 4,
            "degradation_margin_r": pytest.approx(0.02),
        }

    def test_cited_inputs_present(self):
        out = _verdict([0.05, 0.06, 0.05, 0.07, 0.01, 0.0, 0.02, 0.01])
        inputs = out["inputs"]
        assert inputs["window_count"] == 8
        assert inputs["recent_median_r"] == pytest.approx(0.01)
        assert inputs["baseline_median_r"] == pytest.approx(0.035)

    def test_recompute_is_byte_identical(self):
        a = _verdict([0.05, 0.06, 0.05, 0.07, 0.01, 0.0, 0.02, 0.01],
                     gate={"passed": False, "ci_low": -0.7, "ci_high": 2.6})
        b = _verdict([0.05, 0.06, 0.05, 0.07, 0.01, 0.0, 0.02, 0.01],
                     gate={"passed": False, "ci_low": -0.7, "ci_high": 2.6})
        assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


class TestHealthForConfigs:
    CONFIGS = [
        {"id": "c1", "name": "wf-rr3", "strategy_id": "s1"},
        {"id": "c2", "name": "default", "strategy_id": "s1"},
        {"id": "c3", "name": "never-studied", "strategy_id": "s1"},
    ]

    def test_groups_points_and_gates_by_config_name(self):
        points = _windows([0.03] * 8)
        for p in points:
            p["config_name"] = "wf-rr3"
        dist_rows = [
            {"config_name": "wf-rr3", "gate_passed": False, "gate_ci_low": -0.7, "gate_ci_high": 2.6},
            {"config_name": "default", "gate_passed": None, "gate_ci_low": None, "gate_ci_high": None},
        ]
        out = health_for_configs(
            configs=self.CONFIGS, points=points, dist_rows=dist_rows, thresholds=TH
        )
        # configs with zero OOS history are omitted entirely
        assert [v["config_name"] for v in out] == ["wf-rr3"]
        assert out[0]["config_id"] == "c1"
        assert out[0]["strategy_id"] == "s1"
        assert out[0]["inputs"]["gate_passed"] is False

    def test_deterministic_ordering_by_config_name(self):
        points = _windows([0.03] * 6) + _windows([0.02] * 6)
        for p in points[:6]:
            p["config_name"] = "wf-rr3"
        for p in points[6:]:
            p["config_name"] = "default"
        out = health_for_configs(
            configs=self.CONFIGS, points=points, dist_rows=[], thresholds=TH
        )
        assert [v["config_name"] for v in out] == ["default", "wf-rr3"]
