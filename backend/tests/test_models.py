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
