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
    assert strat.evaluate(bar, snap, minutes_since_open=45) is None


def test_no_signal_when_close_below_vwap():
    strat = VwapPullbackLong(VwapPullbackConfig())
    ts = datetime(2026, 5, 28, 10, 15, tzinfo=ET)
    bar = _bar(ts, 524.5, 524.7, 524.2, 524.3)
    snap = _snap(ts, 524.9, 525.0, 523.9, True, -0.114, 524.4)
    assert strat.evaluate(bar, snap, minutes_since_open=45) is None


def test_no_signal_when_distance_from_vwap_too_large():
    strat = VwapPullbackLong(VwapPullbackConfig(max_distance_from_vwap_pct=0.25))
    ts = datetime(2026, 5, 28, 10, 15, tzinfo=ET)
    bar = _bar(ts, 526.0, 526.5, 525.9, 526.4)
    # 0.30% > 0.25% threshold
    snap = _snap(ts, 524.88, 525.0, 523.9, True, 0.30, 525.05)
    assert strat.evaluate(bar, snap, minutes_since_open=45) is None


def test_no_signal_when_close_not_above_prior():
    strat = VwapPullbackLong(VwapPullbackConfig(max_distance_from_vwap_pct=0.25))
    ts = datetime(2026, 5, 28, 10, 15, tzinfo=ET)
    bar = _bar(ts, 525.0, 525.2, 524.85, 525.00)  # close == prior 525.05? No, 525.00 < 525.05
    snap = _snap(ts, 524.88, 525.0, 523.9, True, 0.024, 525.05)
    assert strat.evaluate(bar, snap, minutes_since_open=45) is None


def test_emits_signal_on_clean_pullback_confirmation():
    strat = VwapPullbackLong(VwapPullbackConfig(max_distance_from_vwap_pct=0.25))
    ts = datetime(2026, 5, 28, 10, 15, tzinfo=ET)
    bar = _bar(ts, 525.0, 525.2, 524.85, 525.10)
    snap = _snap(ts, 524.88, 525.0, 523.9, True, 0.042, 525.05)
    sig = strat.evaluate(bar, snap, minutes_since_open=45)
    assert sig is not None
    assert sig.planned_entry == 525.10
    assert sig.stop_loss < sig.planned_entry < sig.take_profit
    assert sig.symbol == "SPY"
    assert sig.setup == "vwap_pullback_long"


# ---- Feature 020: entry-window gate (Signal | WindowSkip | None) --------------


def _valid_setup(ts):
    bar = _bar(ts, 525.0, 525.2, 524.85, 525.10)
    snap = _snap(ts, 524.88, 525.0, 523.9, True, 0.042, 525.05)
    return bar, snap


def test_valid_setup_before_window_start_returns_window_skip():
    from intraday_trade_spy.config import EntryWindowConfig
    from intraday_trade_spy.models import WindowSkip

    cfg = VwapPullbackConfig(entry_window=EntryWindowConfig(
        start_minutes_after_open=30, end_minutes_after_open=270))
    strat = VwapPullbackLong(cfg)
    ts = datetime(2026, 5, 28, 9, 50, tzinfo=ET)
    bar, snap = _valid_setup(ts)
    out = strat.evaluate(bar, snap, minutes_since_open=20)
    assert isinstance(out, WindowSkip)
    assert out.start_minutes_after_open == 30
    assert out.end_minutes_after_open == 270
    assert "20" in out.reason and "30" in out.reason


def test_valid_setup_after_window_end_returns_window_skip():
    from intraday_trade_spy.config import EntryWindowConfig
    from intraday_trade_spy.models import WindowSkip

    cfg = VwapPullbackConfig(entry_window=EntryWindowConfig(
        start_minutes_after_open=30, end_minutes_after_open=270))
    strat = VwapPullbackLong(cfg)
    ts = datetime(2026, 5, 28, 14, 5, tzinfo=ET)
    bar, snap = _valid_setup(ts)
    out = strat.evaluate(bar, snap, minutes_since_open=275)
    assert isinstance(out, WindowSkip)


def test_non_setup_outside_window_returns_none_not_skip():
    from intraday_trade_spy.config import EntryWindowConfig

    cfg = VwapPullbackConfig(entry_window=EntryWindowConfig(
        start_minutes_after_open=30, end_minutes_after_open=270))
    strat = VwapPullbackLong(cfg)
    ts = datetime(2026, 5, 28, 9, 50, tzinfo=ET)
    bar = _bar(ts, 524.5, 524.7, 524.2, 524.3)            # close below vwap
    snap = _snap(ts, 524.9, 525.0, 523.9, True, -0.114, 524.4)
    assert strat.evaluate(bar, snap, minutes_since_open=20) is None


def test_default_window_never_skips_in_session():
    from intraday_trade_spy.models import Signal

    strat = VwapPullbackLong(VwapPullbackConfig())
    for minute in (15, 16, 100, 200, 359, 385):
        ts = datetime(2026, 5, 28, 10, 15, tzinfo=ET)
        bar, snap = _valid_setup(ts)
        out = strat.evaluate(bar, snap, minutes_since_open=minute)
        assert isinstance(out, Signal)  # FR-010: defaults behave exactly as before


def test_or_incomplete_still_governs_regardless_of_window():
    from intraday_trade_spy.config import EntryWindowConfig

    cfg = VwapPullbackConfig(entry_window=EntryWindowConfig(
        start_minutes_after_open=0, end_minutes_after_open=390))
    strat = VwapPullbackLong(cfg)
    ts = datetime(2026, 5, 28, 9, 40, tzinfo=ET)
    bar = _bar(ts, 525, 525.1, 524.9, 525.0)
    snap = _snap(ts, 524.9, None, None, False, 0.02, 524.8)
    assert strat.evaluate(bar, snap, minutes_since_open=10) is None  # scenario 4


def test_window_boundaries_are_start_inclusive_end_exclusive():
    from intraday_trade_spy.config import EntryWindowConfig
    from intraday_trade_spy.models import Signal, WindowSkip

    cfg = VwapPullbackConfig(entry_window=EntryWindowConfig(
        start_minutes_after_open=30, end_minutes_after_open=270))
    strat = VwapPullbackLong(cfg)
    ts = datetime(2026, 5, 28, 10, 0, tzinfo=ET)
    bar, snap = _valid_setup(ts)
    assert isinstance(strat.evaluate(bar, snap, minutes_since_open=30), Signal)
    assert isinstance(strat.evaluate(bar, snap, minutes_since_open=269), Signal)
    assert isinstance(strat.evaluate(bar, snap, minutes_since_open=270), WindowSkip)
