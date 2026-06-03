"""Feature 010 / US2 (T025): cloud RunSummary carries the new scalar metrics
and push maps them. The legacy `max_drawdown` field keeps its R meaning
(analyze finding I1) — `$`/`%` drawdown live in new sibling fields."""

from decimal import Decimal


def test_run_summary_new_fields_default_safely():
    from intraday_trade_spy.storage.models import RunSummary

    s = RunSummary(
        pnl=Decimal("0"), win_rate=0.0, sharpe=0.0, max_drawdown=Decimal("0"),
        total_trades=0, total_signals=0, rejected_signals=0,
    )
    assert s.sortino == 0.0
    assert s.expectancy == 0.0
    assert s.expectancy_dollars == Decimal("0")
    assert s.max_drawdown_dollars == Decimal("0")
    assert s.max_drawdown_pct == 0.0
    assert s.total_fees == Decimal("0")
    assert s.total_slippage == Decimal("0")
    assert s.low_confidence is False
    assert s.win_rate_ci_low == 0.0
    assert s.win_rate_ci_high == 0.0


def test_build_cloud_summary_maps_new_fields():
    from intraday_trade_spy.storage.push import build_cloud_summary

    summary_data = {
        "total_pnl_dollars": 118.0, "win_rate": 0.5,
        "sharpe": 1.2, "sortino": 1.5,
        "max_drawdown_r": -2.0, "max_drawdown_dollars": 340.0, "max_drawdown_pct": 0.0136,
        "expectancy_r": 0.2, "expectancy_dollars": 1.96,
        "total_fees_dollars": 0.0, "total_slippage_dollars": 2.64,
        "total_trades": 3, "rejected_signal_count": 5,
        "low_confidence": True, "win_rate_ci_low": 0.1, "win_rate_ci_high": 0.9,
    }
    cs = build_cloud_summary(summary_data, total_signals=10)
    assert cs.sharpe == 1.2  # real, not the 0.0 placeholder
    assert cs.sortino == 1.5
    assert cs.max_drawdown == Decimal("-2.0")  # legacy R — unchanged (I1)
    assert cs.max_drawdown_dollars == Decimal("340.0")
    assert cs.max_drawdown_pct == 0.0136
    assert cs.expectancy == 0.2
    assert cs.total_slippage == Decimal("2.64")
    assert cs.low_confidence is True
    assert cs.total_signals == 10


def test_build_cloud_summary_coerces_none_metrics():
    """Degenerate runs (e.g. 0 trades) yield null metrics locally; the cloud
    scalar summary coerces them to safe zeros."""
    from intraday_trade_spy.storage.push import build_cloud_summary

    cs = build_cloud_summary({"total_trades": 0}, total_signals=0)
    assert cs.sharpe == 0.0
    assert cs.sortino == 0.0
    assert cs.max_drawdown_pct == 0.0
    assert cs.expectancy == 0.0
    assert cs.low_confidence is False
