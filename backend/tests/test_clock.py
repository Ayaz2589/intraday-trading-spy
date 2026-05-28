from datetime import datetime, time
from zoneinfo import ZoneInfo

from intraday_trade_spy.clock import MarketClock

ET = ZoneInfo("America/New_York")


def _clk():
    return MarketClock(
        session_start=time(9, 30),
        session_end=time(16, 0),
        no_new_trades_after=time(15, 30),
        force_flat_time=time(15, 55),
    )


def test_market_open_inside_session():
    assert _clk().is_market_open(datetime(2026, 5, 28, 10, 0, tzinfo=ET)) is True


def test_market_closed_before_open():
    assert _clk().is_market_open(datetime(2026, 5, 28, 9, 0, tzinfo=ET)) is False


def test_market_closed_at_close():
    assert _clk().is_market_open(datetime(2026, 5, 28, 16, 0, tzinfo=ET)) is False


def test_or_complete_after_window():
    clk = _clk()
    assert clk.is_or_complete(datetime(2026, 5, 28, 9, 45, tzinfo=ET), or_minutes=15) is True
    assert clk.is_or_complete(datetime(2026, 5, 28, 9, 40, tzinfo=ET), or_minutes=15) is False


def test_no_new_trades_after_cutoff():
    clk = _clk()
    assert clk.allow_new_trades(datetime(2026, 5, 28, 15, 29, tzinfo=ET)) is True
    assert clk.allow_new_trades(datetime(2026, 5, 28, 15, 31, tzinfo=ET)) is False


def test_force_flat():
    assert _clk().is_force_flat(datetime(2026, 5, 28, 15, 55, tzinfo=ET)) is True
    assert _clk().is_force_flat(datetime(2026, 5, 28, 15, 54, tzinfo=ET)) is False
