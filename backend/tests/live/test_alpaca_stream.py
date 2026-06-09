"""Feature 021 T017 — websocket stream wrappers (research.md R1/R2).

Reconnect with backoff on disconnect, gap callbacks, and trade-update →
engine-dict conversion. All against faked stream objects — offline."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest


@pytest.mark.asyncio
@pytest.mark.api  # asyncio loops need socketpair; no real network (fakes only)
async def test_market_stream_reconnects_with_backoff_and_reports_gaps():
    from intraday_trade_spy.live.alpaca_stream import MarketDataStream

    attempts = []
    sleeps = []
    stop = asyncio.Event()

    class FakeStream:
        def __init__(self, n):
            self.n = n

        def subscribe_bars(self, handler, symbol):
            assert symbol == "SPY"

        async def _run_forever(self):
            if self.n <= 2:
                raise ConnectionError(f"drop {self.n}")
            stop.set()

    def factory():
        attempts.append(len(attempts))
        return FakeStream(len(attempts))

    gaps = []

    async def fake_sleep(s):
        sleeps.append(s)

    stream = MarketDataStream(
        factory=factory, on_bar=lambda b: None, on_gap=gaps.append,
        backoff_seconds=(1, 2, 4), sleep=fake_sleep,
    )
    await stream.run(stop)
    assert len(attempts) == 3       # two drops + the final good connection
    assert sleeps == [1, 2]         # escalating backoff
    assert len(gaps) == 2


@pytest.mark.asyncio
@pytest.mark.api  # asyncio loops need socketpair; no real network (fakes only)
async def test_market_stream_forwards_bars():
    from intraday_trade_spy.live.alpaca_stream import MarketDataStream

    stop = asyncio.Event()
    got = []

    class FakeStream:
        def subscribe_bars(self, handler, symbol):
            self._handler = handler

        async def _run_forever(self):
            await self._handler({"t": 1})
            stop.set()

    stream = MarketDataStream(
        factory=lambda: FakeStream(), on_bar=got.append, on_gap=lambda e: None,
    )
    await stream.run(stop)
    assert got == [{"t": 1}]


def test_trade_update_conversion():
    from intraday_trade_spy.live.alpaca_stream import trade_update_to_dict

    ts = datetime(2026, 6, 8, 14, 0, tzinfo=UTC)
    data = SimpleNamespace(
        event="fill",
        timestamp=ts,
        order=SimpleNamespace(
            id="ord-9", status="filled", filled_qty="12",
            filled_avg_price="525.10",
        ),
    )
    out = trade_update_to_dict(data)
    assert out == {
        "broker_order_id": "ord-9", "status": "filled", "filled_qty": 12,
        "filled_avg_price": 525.10, "timestamp": ts, "event": "fill",
    }


def test_trade_update_conversion_handles_missing_fills():
    from intraday_trade_spy.live.alpaca_stream import trade_update_to_dict

    data = SimpleNamespace(
        event="canceled", timestamp=None,
        order=SimpleNamespace(id="ord-9", status="canceled",
                              filled_qty=None, filled_avg_price=None),
    )
    out = trade_update_to_dict(data)
    assert out["filled_qty"] == 0 and out["filled_avg_price"] is None
    assert out["timestamp"] is not None  # defaults to now (aware)


# ---- Feature 024: stop hammering on fatal auth / connection-limit errors --------

@pytest.mark.asyncio
@pytest.mark.api
async def test_market_stream_stops_on_connection_limit_instead_of_hammering():
    """A `connection limit exceeded` auth failure is FATAL: report it, fire
    on_fatal once, and STOP the retry loop — never hammer the broker."""
    from intraday_trade_spy.live.alpaca_stream import MarketDataStream

    stop = asyncio.Event()
    attempts = []
    sleeps = []
    fatals = []

    class FakeStream:
        def subscribe_bars(self, handler, symbol):
            pass

        async def _run_forever(self):
            raise ValueError("connection limit exceeded")

    def factory():
        attempts.append(1)
        return FakeStream()

    async def fake_sleep(s):
        sleeps.append(s)

    stream = MarketDataStream(
        factory=factory, on_bar=lambda b: None, on_gap=lambda e: None,
        on_fatal=fatals.append, backoff_seconds=(1, 2, 4), sleep=fake_sleep,
    )
    await stream.run(stop)
    assert len(attempts) == 1     # tried once, did NOT retry
    assert sleeps == []           # no backoff-retry hammering
    assert len(fatals) == 1       # surfaced the fatal error


@pytest.mark.asyncio
@pytest.mark.api
async def test_market_stream_treats_http_429_as_fatal():
    from intraday_trade_spy.live.alpaca_stream import MarketDataStream

    stop = asyncio.Event()
    attempts = []
    fatals = []

    class FakeStream:
        def subscribe_bars(self, handler, symbol):
            pass

        async def _run_forever(self):
            raise Exception("server rejected WebSocket connection: HTTP 429")

    def factory():
        attempts.append(1)
        return FakeStream()

    stream = MarketDataStream(
        factory=factory, on_bar=lambda b: None, on_gap=lambda e: None,
        on_fatal=fatals.append, sleep=lambda s: asyncio.sleep(0),
    )
    await stream.run(stop)
    assert len(attempts) == 1 and len(fatals) == 1


@pytest.mark.asyncio
@pytest.mark.api
async def test_market_stream_without_on_fatal_still_stops_on_fatal_error():
    """on_fatal is optional; a fatal error must still stop the loop (not loop)."""
    from intraday_trade_spy.live.alpaca_stream import MarketDataStream

    stop = asyncio.Event()
    attempts = []

    class FakeStream:
        def subscribe_bars(self, handler, symbol):
            pass

        async def _run_forever(self):
            raise ValueError("connection limit exceeded")

    stream = MarketDataStream(
        factory=lambda: (attempts.append(1), FakeStream())[1],
        on_bar=lambda b: None, on_gap=lambda e: None,
        sleep=lambda s: asyncio.sleep(0),
    )
    await stream.run(stop)
    assert len(attempts) == 1
