"""Feature 021 — session runner glue: raw stream bars → aggregator → engine,
and the conversion from alpaca bar objects to the domain Bar model."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")


def _raw(hh, mm):
    # alpaca stream bars arrive UTC; 13:30 UTC == 09:30 ET (June, EDT)
    return SimpleNamespace(
        symbol="SPY",
        timestamp=datetime(2026, 6, 8, hh, mm, tzinfo=UTC),
        open=525.0, high=525.5, low=524.7, close=525.2, volume=1000,
    )


def test_alpaca_bar_to_model_converts_to_et_session_date():
    from intraday_trade_spy.live.runner import alpaca_bar_to_model

    bar = alpaca_bar_to_model(_raw(13, 30))
    assert bar.symbol == "SPY"
    assert bar.session_date.isoformat() == "2026-06-08"
    assert bar.timestamp.astimezone(ET).hour == 9


def test_on_raw_bar_pumps_completed_buckets_into_the_engine():
    from intraday_trade_spy.live.runner import PaperSessionRunner

    seen = []

    class FakeEngine:
        def on_five_minute_bar(self, bar):
            seen.append(bar)

        def on_tick(self, now):
            pass

    runner = PaperSessionRunner.__new__(PaperSessionRunner)
    runner._engine = FakeEngine()
    from intraday_trade_spy.live.aggregator import BarAggregator

    runner._aggregator = BarAggregator()

    for mm in (30, 31, 32, 33, 34):
        runner.on_raw_bar(_raw(13, mm))
    assert seen == []  # bucket still open
    runner.on_raw_bar(_raw(13, 35))
    assert len(seen) == 1
    assert seen[0].timestamp.astimezone(ET).minute == 30
