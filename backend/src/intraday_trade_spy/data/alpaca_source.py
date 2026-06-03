"""Alpaca historical bar source (Feature 009).

Multi-year SPY 5-minute bars from Alpaca's historical data API. Read-only —
constructs ONLY the market-data client, never a trading/order client
(constitution V). The data client is injectable for tests (no network/keys).

Bars are normalized into the project's BarRow shape, filtered to the regular
session (09:30–16:00 ET), and screened for OHLC/volume sanity.
"""

from __future__ import annotations

import os
from datetime import date, datetime
from zoneinfo import ZoneInfo

from intraday_trade_spy.data.bar_source import BarRow, require_spy
from intraday_trade_spy.data.validation import in_regular_session, ohlc_is_sane

_ET = ZoneInfo("America/New_York")


class AlpacaBarSource:
    """`BarSource` backed by Alpaca's historical market-data API.

    `client` is injectable (anything with `get_stock_bars(request)` returning a
    bar set with `.data[symbol] -> list[bar]`). Production builds a
    `StockHistoricalDataClient` from env credentials.
    """

    name = "alpaca"

    def __init__(self, client=None, *, feed: str = "iex") -> None:
        self._client = client
        self._feed = feed

    def _build_client(self):
        from alpaca.data.historical import StockHistoricalDataClient

        api_key = os.environ.get("ALPACA_API_KEY")
        secret_key = os.environ.get("ALPACA_SECRET_KEY")
        if not api_key or not secret_key:
            raise RuntimeError(
                "ALPACA_API_KEY / ALPACA_SECRET_KEY must be set for Alpaca backfill."
            )
        # Market-data client only — NO trading client (constitution V).
        return StockHistoricalDataClient(api_key, secret_key)

    def _build_request(self, *, start: date, end: date, symbol: str, timeframe: str):
        from alpaca.data.enums import Adjustment, DataFeed
        from alpaca.data.requests import StockBarsRequest
        from alpaca.data.timeframe import TimeFrame, TimeFrameUnit

        if timeframe != "5m":
            raise ValueError(f"AlpacaBarSource supports 5m only; got {timeframe!r}")
        feed = DataFeed.SIP if self._feed.lower() == "sip" else DataFeed.IEX
        return StockBarsRequest(
            symbol_or_symbols=symbol,
            timeframe=TimeFrame(5, TimeFrameUnit.Minute),
            start=datetime(start.year, start.month, start.day, tzinfo=_ET),
            end=datetime(end.year, end.month, end.day, 23, 59, tzinfo=_ET),
            feed=feed,
            adjustment=Adjustment.RAW,
        )

    def fetch_rows(
        self, *, start: date, end: date, symbol: str = "SPY", timeframe: str = "5m"
    ) -> list[BarRow]:
        require_spy(symbol)
        client = self._client if self._client is not None else self._build_client()
        request = self._build_request(
            start=start, end=end, symbol=symbol, timeframe=timeframe
        )
        barset = client.get_stock_bars(request)
        bars = (getattr(barset, "data", {}) or {}).get(symbol, [])

        rows: list[BarRow] = []
        for b in bars:
            ts_et = b.timestamp.astimezone(_ET)
            if not in_regular_session(ts_et):
                continue
            o, h, lo, c = float(b.open), float(b.high), float(b.low), float(b.close)
            vol = int(b.volume)
            if vol <= 0 or not ohlc_is_sane(o, h, lo, c):
                continue
            rows.append(
                {
                    "bar_start": ts_et.isoformat(),
                    "open": o,
                    "high": h,
                    "low": lo,
                    "close": c,
                    "volume": vol,
                    "source": self.name,
                }
            )
        return rows
