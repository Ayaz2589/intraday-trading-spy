"""T036/T038 — parameter-sensitivity grid + surface (Feature 011, FR-010..012).

Grid enumeration + surface aggregation are unit-tested with an injected
evaluator (no bars/DB). The grid is human-specified explicit value lists (no
auto-ranging — keeps parameter research manual, Principle II).
"""

from types import SimpleNamespace

import pytest

from intraday_trade_spy.models import SensitivityPoint, SensitivitySurface
from intraday_trade_spy.validation.sweep import (
    GridSpecError,
    dotted_to_nested,
    grid_points,
    planned_evaluations,
    run_sensitivity,
)

RR = "strategy.vwap_pullback.target.risk_reward"
DIST = "strategy.vwap_pullback.max_distance_from_vwap_pct"


def test_models_construct():
    p = SensitivityPoint(coords={RR: 2.0}, metric=1.5, trade_count=100, low_confidence=False, run_id="r1")
    s = SensitivitySurface(metric_name="expectancy_dollars", knobs=[RR], axes={RR: [1.5, 2.0]}, points=[p], segment="train")
    assert s.points[0].coords[RR] == 2.0


def test_dotted_to_nested():
    assert dotted_to_nested({RR: 2.5}) == {
        "strategy": {"vwap_pullback": {"target": {"risk_reward": 2.5}}}
    }


def test_grid_points_1d_and_2d():
    g1 = [{"knob": RR, "values": [1.5, 2.0, 2.5]}]
    assert grid_points(g1) == [{RR: 1.5}, {RR: 2.0}, {RR: 2.5}]
    assert planned_evaluations(g1) == 3

    g2 = [{"knob": RR, "values": [1.5, 2.0]}, {"knob": DIST, "values": [0.2, 0.3, 0.4]}]
    pts = grid_points(g2)
    assert len(pts) == 6
    assert {RR: 1.5, DIST: 0.2} in pts and {RR: 2.0, DIST: 0.4} in pts
    assert planned_evaluations(g2) == 6


def test_grid_rejects_three_dims_and_empty():
    with pytest.raises(GridSpecError):
        grid_points([{"knob": "a", "values": [1]}, {"knob": "b", "values": [1]}, {"knob": "c", "values": [1]}])
    with pytest.raises(GridSpecError):
        grid_points([{"knob": RR, "values": []}])
    with pytest.raises(GridSpecError):
        grid_points([])


def test_run_sensitivity_builds_surface():
    grid = [{"knob": RR, "values": [1.5, 2.0, 2.5]}]
    metrics = {1.5: 0.5, 2.0: 2.4, 2.5: 1.1}  # a plateau-ish middle

    def evaluate(coords):
        v = metrics[coords[RR]]
        summary = SimpleNamespace(expectancy_dollars=v, total_trades=100, low_confidence=False)
        return SimpleNamespace(summary=summary, run=SimpleNamespace(run_id=f"r{coords[RR]}"))

    surface = run_sensitivity(
        grid=grid, metric="expectancy_dollars", segment="train", evaluate=evaluate
    )
    assert isinstance(surface, SensitivitySurface)
    assert surface.knobs == [RR]
    assert surface.axes[RR] == [1.5, 2.0, 2.5]
    assert len(surface.points) == 3
    by_v = {p.coords[RR]: p.metric for p in surface.points}
    assert by_v == {1.5: 0.5, 2.0: 2.4, 2.5: 1.1}
    # The spike/peak is the 2.0 point.
    assert max(surface.points, key=lambda p: p.metric).coords[RR] == 2.0
