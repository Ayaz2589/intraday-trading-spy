from datetime import date, datetime
from zoneinfo import ZoneInfo

from intraday_trade_spy.broker.paper import PaperBroker
from intraday_trade_spy.models import Bar, Direction, Signal, TradePlan

ET = ZoneInfo("America/New_York")


def _bar(ts, o, h, lo, c):
    return Bar(
        symbol="SPY",
        timestamp=ts,
        open=o, high=h, low=lo, close=c,
        volume=1,
        session_date=date(ts.year, ts.month, ts.day),
    )


def _plan(entry=500.0, stop=499.0, target=502.0, qty=10):
    sig = Signal(
        symbol="SPY",
        setup="vwap_pullback_long",
        direction=Direction.LONG,
        timestamp=datetime(2026, 5, 28, 10, 15, tzinfo=ET),
        planned_entry=entry,
        stop_loss=stop,
        take_profit=target,
        reason="x",
    )
    return TradePlan(signal=sig, quantity=qty, planned_risk_dollars=qty * (entry - stop))


def test_entry_fills_at_next_bar_open():
    brk = PaperBroker()
    pos = brk.simulate_entry(
        _plan(),
        next_bar=_bar(datetime(2026, 5, 28, 10, 20, tzinfo=ET), 500.5, 501, 500.4, 500.8),
    )
    assert pos.entry_price == 500.5
    assert pos.exit_timestamp is None


def test_stop_fills_alone():
    brk = PaperBroker()
    plan = _plan(entry=500, stop=499, target=502, qty=10)
    pos = brk.simulate_entry(
        plan, next_bar=_bar(datetime(2026, 5, 28, 10, 20, tzinfo=ET), 500.0, 500.1, 499.9, 500.05)
    )
    pos = brk.simulate_bar(
        pos, _bar(datetime(2026, 5, 28, 10, 25, tzinfo=ET), 500.0, 500.1, 498.5, 499.0)
    )
    assert pos.exit_reason == "stop"
    assert pos.exit_price == 499
    assert pos.realized_r == -1.0
    assert pos.same_bar_tiebreak == "none"


def test_target_fills_alone():
    brk = PaperBroker()
    plan = _plan(entry=500, stop=499, target=502, qty=10)
    pos = brk.simulate_entry(
        plan, next_bar=_bar(datetime(2026, 5, 28, 10, 20, tzinfo=ET), 500.0, 500.1, 499.9, 500.05)
    )
    pos = brk.simulate_bar(
        pos, _bar(datetime(2026, 5, 28, 10, 25, tzinfo=ET), 500.0, 502.1, 499.8, 502.0)
    )
    assert pos.exit_reason == "target"
    assert pos.exit_price == 502
    # entry=500, stop=499, target=502 → R=2.0
    assert abs(pos.realized_r - 2.0) < 1e-9


def test_stop_fills_first_when_both_hit_same_bar():
    brk = PaperBroker()
    plan = _plan(entry=500, stop=499, target=502, qty=10)
    pos = brk.simulate_entry(
        plan, next_bar=_bar(datetime(2026, 5, 28, 10, 20, tzinfo=ET), 500.0, 500.1, 499.9, 500.05)
    )
    pos = brk.simulate_bar(
        pos, _bar(datetime(2026, 5, 28, 10, 25, tzinfo=ET), 500.0, 502.5, 498.5, 501.0)
    )
    assert pos.exit_reason == "stop"
    assert pos.same_bar_tiebreak == "stop_first"
    assert pos.realized_r == -1.0


def test_no_exit_when_neither_hit():
    brk = PaperBroker()
    plan = _plan(entry=500, stop=499, target=502, qty=10)
    pos = brk.simulate_entry(
        plan, next_bar=_bar(datetime(2026, 5, 28, 10, 20, tzinfo=ET), 500.0, 500.1, 499.9, 500.05)
    )
    pos = brk.simulate_bar(
        pos, _bar(datetime(2026, 5, 28, 10, 25, tzinfo=ET), 500.0, 501.5, 499.3, 500.5)
    )
    assert pos.exit_reason is None
    assert pos.exit_timestamp is None


def test_force_flat_closes_at_next_bar_open():
    brk = PaperBroker()
    plan = _plan(entry=500, stop=499, target=502, qty=10)
    pos = brk.simulate_entry(
        plan, next_bar=_bar(datetime(2026, 5, 28, 10, 20, tzinfo=ET), 500.0, 500.1, 499.9, 500.05)
    )
    next_bar = _bar(datetime(2026, 5, 28, 15, 55, tzinfo=ET), 500.7, 500.8, 500.5, 500.6)
    pos = brk.force_flat(pos, next_bar)
    assert pos.exit_reason == "force_flat"
    assert pos.exit_price == 500.7
