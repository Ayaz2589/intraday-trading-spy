from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest
from pydantic import ValidationError

from intraday_trade_spy.models import Bar, Direction, Signal

ET = ZoneInfo("America/New_York")


def test_bar_rejects_non_spy():
    with pytest.raises(ValidationError):
        Bar(
            symbol="QQQ",
            timestamp=datetime(2026, 5, 28, 10, 0, tzinfo=ET),
            open=1, high=1, low=1, close=1, volume=1,
            session_date=date(2026, 5, 28),
        )


def test_bar_rejects_high_below_low():
    with pytest.raises(ValidationError):
        Bar(
            symbol="SPY",
            timestamp=datetime(2026, 5, 28, 10, 0, tzinfo=ET),
            open=1, high=0.5, low=1.0, close=1, volume=1,
            session_date=date(2026, 5, 28),
        )


def test_direction_only_long():
    assert [d.value for d in Direction] == ["long"]


def test_signal_rejects_stop_above_entry():
    with pytest.raises(ValidationError):
        Signal(
            symbol="SPY",
            setup="vwap_pullback_long",
            direction=Direction.LONG,
            timestamp=datetime(2026, 5, 28, 10, 0, tzinfo=ET),
            planned_entry=100.0,
            stop_loss=101.0,
            take_profit=102.0,
            reason="x",
        )


def test_signal_rejects_target_below_entry():
    with pytest.raises(ValidationError):
        Signal(
            symbol="SPY",
            setup="vwap_pullback_long",
            direction=Direction.LONG,
            timestamp=datetime(2026, 5, 28, 10, 0, tzinfo=ET),
            planned_entry=100.0,
            stop_loss=99.0,
            take_profit=98.0,
            reason="x",
        )


# ---------- Feature 010: honest-backtest model fields ----------


def _signal():
    return Signal(
        symbol="SPY",
        setup="vwap_pullback_long",
        direction=Direction.LONG,
        timestamp=datetime(2026, 5, 28, 10, 0, tzinfo=ET),
        planned_entry=100.0,
        stop_loss=99.0,
        take_profit=102.0,
        reason="x",
    )


def test_position_has_cost_fields_defaulting_none():
    """T005: Position carries gross_pnl / fees / slippage_cost (default None)."""
    from intraday_trade_spy.models import Position, TradePlan

    plan = TradePlan(signal=_signal(), quantity=10, planned_risk_dollars=10.0)
    pos = Position(
        plan=plan,
        entry_timestamp=datetime(2026, 5, 28, 10, 5, tzinfo=ET),
        entry_price=100.01,
    )
    assert pos.gross_pnl is None
    assert pos.fees is None
    assert pos.slippage_cost is None
    # and they are settable
    pos2 = pos.model_copy(update=dict(gross_pnl=20.0, fees=0.0, slippage_cost=0.2, realized_pnl=19.8))
    assert pos2.gross_pnl == 20.0
    assert pos2.realized_pnl == 19.8


def test_journal_entry_has_cost_fields():
    """T005: JournalEntry carries the cost breakdown (constitution VII)."""
    from intraday_trade_spy.models import JournalEntry, SignalStatus

    je = JournalEntry(
        row_seq=1,
        timestamp=datetime(2026, 5, 28, 10, 0, tzinfo=ET),
        status=SignalStatus.EXITED,
        reason="Exit via target",
        gross_pnl=20.0,
        fees=0.0,
        slippage_cost=0.2,
        realized_pnl=19.8,
    )
    assert je.gross_pnl == 20.0
    assert je.fees == 0.0
    assert je.slippage_cost == 0.2


def test_equity_point_and_bucket():
    """T005: new value objects exist and accept a null seed timestamp."""
    from intraday_trade_spy.models import Bucket, EquityPoint

    seed = EquityPoint(timestamp=None, equity=25000.0, cumulative_net_pnl=0.0)
    assert seed.equity == 25000.0 and seed.timestamp is None
    b = Bucket(key="10", trade_count=5, net_pnl_dollars=12.0, win_rate=0.4, expectancy_r=0.1)
    assert b.key == "10" and b.trade_count == 5


def test_summary_metrics_new_fields_default_safely():
    """T005: SummaryMetrics gains the new metric fields with safe defaults so a
    zero-trade summary constructs without error (degenerate-input contract)."""
    from intraday_trade_spy.models import SummaryMetrics

    s = SummaryMetrics(
        total_trades=0, wins=0, losses=0, win_rate=0.0,
        average_win_r=0.0, average_loss_r=0.0, average_r=0.0, total_r=0.0,
        profit_factor=None, max_drawdown_r=0.0,
        best_trade_r=None, worst_trade_r=None,
        longest_consecutive_loss_streak=0, rejected_signal_count=0,
    )
    assert s.expectancy_r is None
    assert s.expectancy_dollars is None
    assert s.sharpe is None
    assert s.sortino is None
    assert s.max_drawdown_dollars == 0.0
    assert s.max_drawdown_pct is None
    assert s.return_median_dollars is None
    assert s.return_std_dollars is None
    assert s.return_skew is None
    assert s.win_rate_ci_low is None
    assert s.win_rate_ci_high is None
    assert s.low_confidence is False
    assert s.total_net_pnl_dollars == 0.0
    assert s.total_fees_dollars == 0.0
    assert s.total_slippage_dollars == 0.0
    assert s.equity_curve == []
    assert s.hour_buckets == []
    assert s.weekday_buckets == []
    assert s.month_buckets == []
