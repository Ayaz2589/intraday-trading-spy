"""Feature 010 / US2 (T027): RunSummaryView exposes the new metric fields with
safe defaults for pre-010 rows."""

from decimal import Decimal


def test_run_summary_view_defaults_for_legacy_rows():
    from intraday_trade_spy.api.schemas import RunSummaryView

    v = RunSummaryView()  # legacy row: summary == {}
    # existing fields
    assert v.sharpe == 0.0
    assert v.total_trades == 0
    # new Feature 010 fields default safely
    assert v.sortino == 0.0
    assert v.expectancy == 0.0
    assert v.expectancy_dollars == Decimal("0")
    assert v.max_drawdown_dollars == Decimal("0")
    assert v.max_drawdown_pct == 0.0
    assert v.total_fees == Decimal("0")
    assert v.total_slippage == Decimal("0")
    assert v.low_confidence is False
    assert v.win_rate_ci_low == 0.0
    assert v.win_rate_ci_high == 0.0


def test_run_summary_view_accepts_new_fields():
    from intraday_trade_spy.api.schemas import RunSummaryView

    v = RunSummaryView(sortino=1.5, max_drawdown_dollars=Decimal("340"), low_confidence=True)
    assert v.sortino == 1.5
    assert v.max_drawdown_dollars == Decimal("340")
    assert v.low_confidence is True
