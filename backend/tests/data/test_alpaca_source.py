"""Feature 009 — AlpacaBarSource (TDD, constitution IV).

The Alpaca historical-data client is INJECTED so these run with no network and
no credentials. Proves: multi-year reach (no 730-day cap), 5-min IEX request,
ET regular-session filter, OHLC/volume validation, source='alpaca', SPY-only.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, date
from zoneinfo import ZoneInfo

import pytest

from intraday_trade_spy.data.alpaca_source import AlpacaBarSource
from intraday_trade_spy.data.bar_source import BarSource

UTC_TZ = UTC


@dataclass
class FakeBar:
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int


class FakeBarSet:
    def __init__(self, data):
        self.data = data


class FakeClient:
    """Captures the request and returns canned bars."""

    def __init__(self, bars):
        self._bars = bars
        self.last_request = None

    def get_stock_bars(self, request):
        self.last_request = request
        return FakeBarSet({"SPY": self._bars})


def _utc(y, mo, d, h, mi):
    return datetime(y, mo, d, h, mi, tzinfo=UTC_TZ)


def test_name_and_protocol():
    src = AlpacaBarSource(client=FakeClient([]))
    assert src.name == "alpaca"
    assert isinstance(src, BarSource)


def test_rejects_non_spy():
    with pytest.raises(ValueError):
        AlpacaBarSource(client=FakeClient([])).fetch_rows(
            start=date(2018, 1, 2), end=date(2018, 1, 3), symbol="QQQ"
        )


def test_multi_year_fetch_normalizes_and_stamps_source():
    # 2018 (>730 days before today) — proves no yfinance-style history cap.
    bars = [
        # 14:35 UTC = 09:35 ET (EST) — in session, valid
        FakeBar(_utc(2018, 1, 2, 14, 35), 100.0, 100.5, 99.8, 100.2, 5000),
        # 20:55 UTC = 15:55 ET — in session, valid
        FakeBar(_utc(2018, 1, 2, 20, 55), 101.0, 101.2, 100.9, 101.1, 3000),
    ]
    rows = AlpacaBarSource(client=FakeClient(bars)).fetch_rows(
        start=date(2018, 1, 1), end=date(2018, 3, 1)
    )
    assert len(rows) == 2
    assert all(r["source"] == "alpaca" for r in rows)
    et = ZoneInfo("America/New_York")
    # bar_start is ET ISO-8601
    first = datetime.fromisoformat(rows[0]["bar_start"])
    assert first.astimezone(et).strftime("%H:%M") == "09:35"
    assert set(rows[0]) == {"bar_start", "open", "high", "low", "close", "volume", "source"}


def test_drops_out_of_session_zero_volume_and_insane_bars():
    bars = [
        FakeBar(_utc(2018, 1, 2, 13, 0), 100.0, 100.5, 99.8, 100.2, 5000),   # 08:00 ET pre-market → drop
        FakeBar(_utc(2018, 1, 2, 21, 5), 100.0, 100.5, 99.8, 100.2, 5000),   # 16:05 ET after close → drop
        FakeBar(_utc(2018, 1, 2, 14, 35), 100.0, 100.5, 99.8, 100.2, 0),     # zero volume → drop
        FakeBar(_utc(2018, 1, 2, 14, 40), 100.0, 99.0, 100.5, 100.2, 5000),  # high<low insane → drop
        FakeBar(_utc(2018, 1, 2, 14, 45), 100.0, 100.6, 99.7, 100.3, 5000),  # valid → keep
    ]
    rows = AlpacaBarSource(client=FakeClient(bars)).fetch_rows(
        start=date(2018, 1, 1), end=date(2018, 1, 31)
    )
    assert len(rows) == 1
    et = ZoneInfo("America/New_York")
    assert datetime.fromisoformat(rows[0]["bar_start"]).astimezone(et).strftime("%H:%M") == "09:45"


def test_request_uses_iex_feed_and_5min():
    fc = FakeClient([])
    AlpacaBarSource(client=fc, feed="iex").fetch_rows(
        start=date(2018, 1, 1), end=date(2018, 1, 31)
    )
    req = fc.last_request
    # Feed is IEX (free tier). TimeFrame is 5 minutes.
    assert str(getattr(req, "feed", "")).lower().endswith("iex") or "iex" in str(req.feed).lower()
    assert req.timeframe.amount_value == 5


def test_empty_data_returns_empty_list():
    rows = AlpacaBarSource(client=FakeClient([])).fetch_rows(
        start=date(2018, 1, 1), end=date(2018, 1, 2)
    )
    assert rows == []
