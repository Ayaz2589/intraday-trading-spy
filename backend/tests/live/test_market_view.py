"""Feature 021 T023 (helper) — chart view computation (contracts/trade-api.md
GET /api/trade/bars). Pure: given 1-minute (or daily) frames, produce the
view's bars with session-anchored VWAP on intraday views, none on 30d."""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd
import pytest

ET = ZoneInfo("America/New_York")


def _df_1m(n=12, start_hh=9, start_mm=30):
    rows = []
    px = 525.0
    t0 = datetime(2026, 6, 8, start_hh, start_mm, tzinfo=ET)
    for i in range(n):
        px += 0.1
        rows.append({
            "timestamp": t0 + timedelta(minutes=i),
            "open": px, "high": px + 0.2, "low": px - 0.2, "close": px + 0.1,
            "volume": 1000,
        })
    return pd.DataFrame(rows)


def test_one_minute_view_carries_session_vwap():
    from intraday_trade_spy.live.market_view import intraday_view

    bars = intraday_view(_df_1m(12), view="1m")
    assert len(bars) == 12
    assert all(b["vwap"] is not None for b in bars)
    # vwap of the first bar == its typical price
    first = bars[0]
    tp = (first["h"] + first["l"] + first["c"]) / 3
    assert first["vwap"] == pytest.approx(tp, rel=1e-9)


def test_five_minute_view_aggregates_buckets():
    from intraday_trade_spy.live.market_view import intraday_view

    bars = intraday_view(_df_1m(12), view="5m")
    # 12 one-minute bars from 09:30 = buckets 09:30, 09:35, 09:40 (partial ok for display)
    assert len(bars) == 3
    assert bars[0]["v"] == 5000
    assert bars[0]["o"] == pytest.approx(525.1, rel=1e-9)


def test_since_cursor_returns_only_new_bars():
    from intraday_trade_spy.live.market_view import intraday_view

    all_bars = intraday_view(_df_1m(12), view="1m")
    cut = all_bars[8]["t"]
    newer = intraday_view(_df_1m(12), view="1m", since=cut)
    assert [b["t"] for b in newer] == [b["t"] for b in all_bars[9:]]


def test_daily_view_has_no_vwap():
    from intraday_trade_spy.live.market_view import daily_view

    df = pd.DataFrame([
        {"timestamp": datetime(2026, 6, d, 0, 0, tzinfo=ET), "open": 520 + d,
         "high": 521 + d, "low": 519 + d, "close": 520.5 + d, "volume": 1_000_000}
        for d in range(1, 6)
    ])
    bars = daily_view(df)
    assert len(bars) == 5
    assert all(b["vwap"] is None for b in bars)


def test_empty_frame_is_empty_list():
    from intraday_trade_spy.live.market_view import intraday_view

    assert intraday_view(pd.DataFrame(), view="1m") == []
