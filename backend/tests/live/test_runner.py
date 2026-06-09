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


# ---- warmup wiring (Feature 023 US2) --------------------------------------------

def _cfg():
    from pathlib import Path

    from intraday_trade_spy.config import load_config

    return load_config(Path(__file__).resolve().parents[2] / "config" / "config.yaml")


def _rth_5m_bars(n=4):
    from datetime import date, timedelta

    from intraday_trade_spy.models import Bar

    day = date(2026, 6, 8)
    t0 = datetime(2026, 6, 8, 9, 30, tzinfo=ET)
    out = []
    px = 525.0
    for i in range(n):
        px += 0.2
        out.append(Bar(symbol="SPY", timestamp=t0 + timedelta(minutes=5 * i),
                       open=px, high=px + 0.3, low=px - 0.3, close=px + 0.1,
                       volume=1000 + i, session_date=day))
    return out


class _FakeStorage:
    def append_paper_event(self, **kw):
        return 1


class _FakeBroker:
    def get_position(self):
        return None


def test_runner_applies_warmup_bars_before_streaming():
    """T010 / C2 — warmup bars are loaded into the engine's session state at
    construction, before any live bar is streamed."""
    from intraday_trade_spy.live.runner import PaperSessionRunner

    warmup = _rth_5m_bars(4)
    runner = PaperSessionRunner(
        cfg=_cfg(), session={"id": "ps-1"}, storage=_FakeStorage(),
        broker=_FakeBroker(),
        market_stream_factory=lambda: None,
        trade_stream_factory=lambda: None,
        warmup_bars=warmup,
    )
    assert runner._engine.session_state.bar_count == 4


def test_runner_without_warmup_is_empty():
    """T010 — default (no warmup) leaves the session frame empty."""
    from intraday_trade_spy.live.runner import PaperSessionRunner

    runner = PaperSessionRunner(
        cfg=_cfg(), session={"id": "ps-2"}, storage=_FakeStorage(),
        broker=_FakeBroker(),
        market_stream_factory=lambda: None,
        trade_stream_factory=lambda: None,
    )
    assert runner._engine.session_state.bar_count == 0
