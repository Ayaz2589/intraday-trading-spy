"""Feature 021 (research.md R1/R2) — websocket stream wrappers.

Thin, injectable shells around alpaca-py's StockDataStream/TradingStream:
reconnect with escalating backoff, report every gap (the engine journals
them), and normalize trade-update events into the engine's update dicts.
Factories are injected so every behavior tests offline."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

DEFAULT_BACKOFF = (1, 2, 4, 8, 16, 30)

# Auth-class failures that retrying CANNOT fix and that get WORSE if hammered:
# another live connection already holds the slot ("connection limit exceeded"),
# the broker is rate-limiting us (HTTP 429), or credentials are bad. We must
# stop and surface these — never loop on them (Feature 024).
_FATAL_MARKERS = (
    "connection limit exceeded",
    "http 429",
    "too many requests",
    "auth failed",
    "unauthorized",
    "forbidden",
    "http 403",
)


def is_fatal_stream_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(marker in msg for marker in _FATAL_MARKERS)


class MarketDataStream:
    """Pumps 1-minute SPY bars from a stream factory into on_bar; reconnects
    with backoff on TRANSIENT drops (until the stop event), reporting gaps. A
    FATAL auth/connection-limit error stops the loop and fires on_fatal —
    retrying it would only hammer the broker (Feature 024)."""

    def __init__(self, *, factory: Callable[[], Any], on_bar: Callable[[Any], None],
                 on_gap: Callable[[Exception], None],
                 on_fatal: Callable[[Exception], None] | None = None,
                 backoff_seconds: tuple = DEFAULT_BACKOFF,
                 sleep: Callable[[float], Any] | None = None) -> None:
        self._factory = factory
        self._on_bar = on_bar
        self._on_gap = on_gap
        self._on_fatal = on_fatal
        self._backoff = backoff_seconds
        self._sleep = sleep or asyncio.sleep

    async def run(self, stop: asyncio.Event) -> None:
        attempt = 0
        while not stop.is_set():
            try:
                stream = self._factory()

                async def handler(bar: Any) -> None:
                    self._on_bar(bar)

                stream.subscribe_bars(handler, "SPY")
                await stream._run_forever()
                attempt = 0
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                if stop.is_set():
                    return
                self._on_gap(exc)
                if is_fatal_stream_error(exc):
                    # Do NOT retry — surface it and stop (the runner ends the
                    # session). Hammering an auth/limit error makes it worse.
                    if self._on_fatal is not None:
                        self._on_fatal(exc)
                    return
                delay = self._backoff[min(attempt, len(self._backoff) - 1)]
                attempt += 1
                await self._sleep(delay)


class TradeUpdateStream:
    """Pumps order-update events (fills, cancels, rejects) into on_update."""

    def __init__(self, *, factory: Callable[[], Any],
                 on_update: Callable[[dict], None],
                 on_gap: Callable[[Exception], None],
                 backoff_seconds: tuple = DEFAULT_BACKOFF,
                 sleep: Callable[[float], Any] | None = None) -> None:
        self._factory = factory
        self._on_update = on_update
        self._on_gap = on_gap
        self._backoff = backoff_seconds
        self._sleep = sleep or asyncio.sleep

    async def run(self, stop: asyncio.Event) -> None:
        attempt = 0
        while not stop.is_set():
            try:
                stream = self._factory()

                async def handler(data: Any) -> None:
                    self._on_update(trade_update_to_dict(data))

                stream.subscribe_trade_updates(handler)
                await stream._run_forever()
                attempt = 0
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                if stop.is_set():
                    return
                self._on_gap(exc)
                delay = self._backoff[min(attempt, len(self._backoff) - 1)]
                attempt += 1
                await self._sleep(delay)


def trade_update_to_dict(data: Any) -> dict:
    """Normalize an alpaca TradeUpdate into the engine's update dict."""
    order = data.order
    return {
        "broker_order_id": str(order.id),
        "status": str(order.status),
        "filled_qty": int(float(order.filled_qty or 0)),
        "filled_avg_price": (
            None if order.filled_avg_price is None
            else float(order.filled_avg_price)
        ),
        "timestamp": data.timestamp or datetime.now(UTC),
        "event": str(data.event),
    }
