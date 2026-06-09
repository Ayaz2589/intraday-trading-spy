"""Feature 021 T007 — 1-minute → 5-minute bar aggregation (research.md R1).

Buckets close on ET 5-minute boundaries aligned to the session grid
(09:30, 09:35, …). A 5m bar is emitted ONLY when its bucket completes —
the strategy must never see a partial bar. Session rolls reset state;
out-of-order bars are refused loudly.
"""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest

ET = ZoneInfo("America/New_York")


def _bar(hh, mm, *, o=100.0, h=101.0, lo=99.0, c=100.5, v=1000, day=date(2026, 6, 8)):
    from intraday_trade_spy.models import Bar

    return Bar(
        symbol="SPY",
        timestamp=datetime(day.year, day.month, day.day, hh, mm, tzinfo=ET),
        open=o, high=h, low=lo, close=c, volume=v, session_date=day,
    )


def _agg():
    from intraday_trade_spy.live.aggregator import BarAggregator

    return BarAggregator()


def test_five_one_minute_bars_emit_one_five_minute_bar():
    agg = _agg()
    out = []
    out += agg.push(_bar(9, 30, o=100, h=101, lo=99.5, c=100.2, v=100)) or []
    out += agg.push(_bar(9, 31, o=100.2, h=102, lo=100.0, c=101.5, v=200)) or []
    out += agg.push(_bar(9, 32, o=101.5, h=101.6, lo=99.0, c=99.2, v=300)) or []
    out += agg.push(_bar(9, 33, o=99.2, h=99.9, lo=99.1, c=99.8, v=400)) or []
    out += agg.push(_bar(9, 34, o=99.8, h=100.4, lo=99.7, c=100.1, v=500)) or []
    assert out == []  # bucket not complete until the NEXT bucket's bar arrives
    out += agg.push(_bar(9, 35, o=100.1, h=100.2, lo=100.0, c=100.1, v=50)) or []
    assert len(out) == 1
    b = out[0]
    # OHLCV across the bucket; timestamp = bucket open (09:30)
    assert b.timestamp.hour == 9 and b.timestamp.minute == 30
    assert b.open == 100 and b.close == 100.1
    assert b.high == 102 and b.low == 99.0
    assert b.volume == 1500


def test_partial_bucket_is_never_emitted_mid_bucket():
    agg = _agg()
    assert agg.push(_bar(9, 30)) == []
    assert agg.push(_bar(9, 31)) == []


def test_gap_in_minutes_still_closes_bucket_on_boundary_crossing():
    agg = _agg()
    agg.push(_bar(9, 30, v=100))
    # next bar jumps straight to 09:37 — the 09:30 bucket closes with 1 bar
    out = agg.push(_bar(9, 37, v=70))
    assert len(out) == 1 and out[0].volume == 100


def test_session_roll_resets_state():
    agg = _agg()
    agg.push(_bar(15, 56, day=date(2026, 6, 8)))
    out = agg.push(_bar(9, 30, day=date(2026, 6, 9)))
    # crossing into a new session flushes the old bucket
    assert len(out) == 1 and out[0].session_date == date(2026, 6, 8)


def test_out_of_order_bar_is_refused():
    agg = _agg()
    agg.push(_bar(9, 35))
    with pytest.raises(ValueError):
        agg.push(_bar(9, 31))


def test_flush_emits_the_open_bucket():
    agg = _agg()
    agg.push(_bar(15, 55, v=10))
    agg.push(_bar(15, 56, v=20))
    out = agg.flush()
    assert len(out) == 1 and out[0].volume == 30
    assert agg.flush() == []  # idempotent


def test_preopen_minutes_do_not_contaminate_the_0930_bucket():
    """Feature 023 T006 / C3 — pre-open 1m bars flush as their own 5m bucket;
    the 09:30 regular-session bar excludes all pre-open price/volume."""
    agg = _agg()
    for m in range(25, 30):  # pre-open 09:25–09:29, extreme values
        agg.push(_bar(9, m, o=600, h=601, lo=599, c=600, v=9))
    out = []
    for m in range(30, 35):  # clean 09:30 bucket
        out += agg.push(_bar(9, m, o=100, h=101, lo=99, c=100, v=100)) or []
    out += agg.push(_bar(9, 35, o=100, h=100, lo=100, c=100, v=1)) or []
    by_min = {b.timestamp.minute: b for b in out}
    assert 25 in by_min                       # pre-open bucket emitted separately
    b0930 = by_min[30]
    assert b0930.high == 101 and b0930.low == 99   # no pre-open 601/599
    assert b0930.volume == 500                     # 5×100, no pre-open volume
