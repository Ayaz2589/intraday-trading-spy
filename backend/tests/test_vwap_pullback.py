from datetime import date, datetime
from zoneinfo import ZoneInfo

from intraday_trade_spy.config import VwapPullbackConfig
from intraday_trade_spy.models import Bar, IndicatorSnapshot
from intraday_trade_spy.strategy.vwap_pullback import VwapPullbackLong

ET = ZoneInfo("America/New_York")


def _bar(ts, o, h, lo, c):
    return Bar(
        symbol="SPY",
        timestamp=ts,
        open=o, high=h, low=lo, close=c,
        volume=1000,
        session_date=date(ts.year, ts.month, ts.day),
    )


def _snap(ts, vwap, or_h, or_l, or_complete, dist, prior):
    return IndicatorSnapshot(
        timestamp=ts,
        vwap=vwap,
        or_high=or_h, or_low=or_l, or_complete=or_complete,
        distance_from_vwap_pct=dist,
        prior_bar_close=prior,
    )


def test_no_signal_before_or_complete():
    strat = VwapPullbackLong(VwapPullbackConfig())
    ts = datetime(2026, 5, 28, 9, 40, tzinfo=ET)
    bar = _bar(ts, 525, 525.1, 524.9, 525.0)
    snap = _snap(ts, 524.9, None, None, False, 0.02, 524.8)
    assert strat.evaluate(bar, snap) is None


def test_no_signal_when_close_below_vwap():
    strat = VwapPullbackLong(VwapPullbackConfig())
    ts = datetime(2026, 5, 28, 10, 15, tzinfo=ET)
    bar = _bar(ts, 524.5, 524.7, 524.2, 524.3)
    snap = _snap(ts, 524.9, 525.0, 523.9, True, -0.114, 524.4)
    assert strat.evaluate(bar, snap) is None


def test_no_signal_when_distance_from_vwap_too_large():
    strat = VwapPullbackLong(VwapPullbackConfig(max_distance_from_vwap_pct=0.25))
    ts = datetime(2026, 5, 28, 10, 15, tzinfo=ET)
    bar = _bar(ts, 526.0, 526.5, 525.9, 526.4)
    # 0.30% > 0.25% threshold
    snap = _snap(ts, 524.88, 525.0, 523.9, True, 0.30, 525.05)
    assert strat.evaluate(bar, snap) is None


def test_no_signal_when_close_not_above_prior():
    strat = VwapPullbackLong(VwapPullbackConfig(max_distance_from_vwap_pct=0.25))
    ts = datetime(2026, 5, 28, 10, 15, tzinfo=ET)
    bar = _bar(ts, 525.0, 525.2, 524.85, 525.00)  # close == prior 525.05? No, 525.00 < 525.05
    snap = _snap(ts, 524.88, 525.0, 523.9, True, 0.024, 525.05)
    assert strat.evaluate(bar, snap) is None


def test_emits_signal_on_clean_pullback_confirmation():
    strat = VwapPullbackLong(VwapPullbackConfig(max_distance_from_vwap_pct=0.25))
    ts = datetime(2026, 5, 28, 10, 15, tzinfo=ET)
    bar = _bar(ts, 525.0, 525.2, 524.85, 525.10)
    snap = _snap(ts, 524.88, 525.0, 523.9, True, 0.042, 525.05)
    sig = strat.evaluate(bar, snap)
    assert sig is not None
    assert sig.planned_entry == 525.10
    assert sig.stop_loss < sig.planned_entry < sig.take_profit
    assert sig.symbol == "SPY"
    assert sig.setup == "vwap_pullback_long"
