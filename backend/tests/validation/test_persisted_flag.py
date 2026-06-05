"""T002 (Feature 014, FR-007) — `persisted` flag on WindowMetrics / SensitivityPoint.

One mechanism gates drill-down links everywhere: pre-014 stored results (key
absent) and failed pushes both read as not-drillable; a successful push or
dedup hit reads as drillable.
"""

from datetime import date

from intraday_trade_spy.models import SensitivityPoint, WindowMetrics


def _wm_kwargs(**over):
    base = dict(
        segment="train",
        range_start=date(2020, 1, 1),
        range_end=date(2020, 3, 31),
        run_id="r1",
        total_trades=10,
        expectancy_dollars=1.0,
        expectancy_r=0.01,
        win_rate=0.5,
        profit_factor=1.2,
        sharpe=0.3,
        total_net_pnl_dollars=100.0,
        low_confidence=False,
    )
    base.update(over)
    return base


def test_window_metrics_persisted_defaults_false():
    wm = WindowMetrics(**_wm_kwargs())
    assert wm.persisted is False


def test_window_metrics_persisted_explicit_true_round_trips():
    wm = WindowMetrics(**_wm_kwargs(persisted=True))
    assert wm.persisted is True
    assert wm.model_dump()["persisted"] is True


def test_window_metrics_pre_014_json_parses_not_drillable():
    # A stored 011-era result has no `persisted` key — it must parse cleanly
    # and read as not-drillable.
    data = WindowMetrics(**_wm_kwargs()).model_dump(mode="json")
    data.pop("persisted", None)
    wm = WindowMetrics.model_validate(data)
    assert wm.persisted is False


def test_sensitivity_point_persisted_defaults_false():
    p = SensitivityPoint(
        coords={"strategy.vwap_pullback.target.risk_reward": 2.0},
        metric=1.5,
        trade_count=40,
        low_confidence=False,
        run_id="r2",
    )
    assert p.persisted is False
    assert p.model_dump()["persisted"] is False


def test_sensitivity_point_persisted_true_and_pre_014_parse():
    p = SensitivityPoint(
        coords={"k": 1.0}, metric=None, trade_count=0,
        low_confidence=True, run_id="r3", persisted=True,
    )
    assert p.persisted is True
    data = p.model_dump(mode="json")
    data.pop("persisted")
    assert SensitivityPoint.model_validate(data).persisted is False
