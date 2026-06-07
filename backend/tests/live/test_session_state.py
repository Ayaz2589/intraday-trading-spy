"""Feature 021 T013 — live session state (research.md R3).

GOLDEN PARITY: the live path (append bars one at a time, recompute) must
produce byte-identical indicator snapshots to the backtest path
(attach_indicators over the whole frame). One indicator code path, proven.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd

ET = ZoneInfo("America/New_York")
DAY = date(2026, 6, 8)


def _bars(n=8, day=DAY):
    from intraday_trade_spy.models import Bar

    out = []
    px = 525.0
    for i in range(n):
        ts = datetime(day.year, day.month, day.day, 9, 30, tzinfo=ET) + timedelta(minutes=5 * i)
        px += (1 if i % 3 else -1) * 0.3
        out.append(Bar(
            symbol="SPY", timestamp=ts, open=px, high=px + 0.5, low=px - 0.4,
            close=px + 0.2, volume=1000 + 10 * i, session_date=day,
        ))
    return out


def _df(bars):
    return pd.DataFrame([{
        "timestamp": b.timestamp, "open": b.open, "high": b.high, "low": b.low,
        "close": b.close, "volume": b.volume, "session_date": b.session_date,
    } for b in bars])


def test_appended_snapshots_match_backtest_vectorized_path():
    from intraday_trade_spy.data.indicators import attach_indicators, snapshot_from_row
    from intraday_trade_spy.live.session_state import SessionState

    bars = _bars(8)
    golden_df = attach_indicators(_df(bars), or_minutes=15)

    state = SessionState(or_minutes=15)
    for i, bar in enumerate(bars):
        snap = state.append(bar)
        golden = snapshot_from_row(golden_df.iloc[i])
        assert snap == golden, f"snapshot diverges at bar {i}"


def test_warmup_then_append_continues_the_session():
    from intraday_trade_spy.data.indicators import attach_indicators, snapshot_from_row
    from intraday_trade_spy.live.session_state import SessionState

    bars = _bars(8)
    golden_df = attach_indicators(_df(bars), or_minutes=15)

    state = SessionState(or_minutes=15)
    state.warmup(bars[:5])  # automation started mid-session
    snap = state.append(bars[5])
    assert snap == snapshot_from_row(golden_df.iloc[5])
    assert state.bar_count == 6


def test_new_session_date_resets_state():
    from intraday_trade_spy.live.session_state import SessionState

    state = SessionState(or_minutes=15)
    for b in _bars(3, day=DAY):
        state.append(b)
    nxt = _bars(1, day=date(2026, 6, 9))[0]
    snap = state.append(nxt)
    assert state.bar_count == 1
    assert snap.or_complete is False  # fresh opening range
    assert snap.prior_bar_close is None


def test_minutes_since_open_passthrough():
    from intraday_trade_spy.live.session_state import SessionState

    state = SessionState(or_minutes=15)
    bars = _bars(4)
    for b in bars:
        state.append(b)
    assert state.last_bar.timestamp == bars[-1].timestamp
