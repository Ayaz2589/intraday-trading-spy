"""Feature 021 (research.md R1/R4) — the asyncio session runner.

Glue only: wires real streams/broker into the (fully tested) sync engine —
raw 1m bars → aggregator → engine.on_five_minute_bar; trade updates →
engine.on_order_update; a 1-second ticker drives engine.on_tick (force-flat,
staleness). Holds the in-process registry the stop endpoint signals."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo

from intraday_trade_spy.config import Config
from intraday_trade_spy.live.aggregator import BarAggregator
from intraday_trade_spy.live.alpaca_stream import (
    MarketDataStream,
    TradeUpdateStream,
)
from intraday_trade_spy.live.engine import LiveSessionEngine
from intraday_trade_spy.models import Bar

ET = ZoneInfo("America/New_York")
_log = logging.getLogger(__name__)

# In-process registry: session_id -> runner (the stop endpoint signals it).
RUNNING: dict[str, PaperSessionRunner] = {}


def alpaca_bar_to_model(raw: Any) -> Bar:
    ts = raw.timestamp
    et = ts.astimezone(ET)
    return Bar(
        symbol="SPY", timestamp=ts, open=float(raw.open), high=float(raw.high),
        low=float(raw.low), close=float(raw.close), volume=int(raw.volume),
        session_date=et.date(),
    )


class PaperSessionRunner:
    def __init__(self, *, cfg: Config, session: dict, storage: Any,
                 broker: Any, market_stream_factory: Any,
                 trade_stream_factory: Any, tick_seconds: float = 1.0,
                 warmup_bars: list[Bar] | None = None) -> None:
        self._session = session
        self._storage = storage
        self._engine = LiveSessionEngine(
            cfg=cfg, session_id=session["id"], storage=storage, broker=broker,
        )
        # Feature 023 — prime today's already-elapsed regular-session bars so
        # session-anchored VWAP/OR are correct on the very first live bar
        # (at-open or mid-session start). RTH-only by construction; applied
        # before any live bar streams in.
        if warmup_bars:
            self._engine.session_state.warmup(warmup_bars)
        self._aggregator = BarAggregator()
        self._stop = asyncio.Event()
        self._tick_seconds = tick_seconds
        self._reconcile_seconds = cfg.paper.reconcile_seconds
        self._market = MarketDataStream(
            factory=market_stream_factory,
            on_bar=self.on_raw_bar,
            on_gap=self._on_gap,
        )
        self._trades = TradeUpdateStream(
            factory=trade_stream_factory,
            on_update=self._engine.on_order_update,
            on_gap=self._on_gap,
        )

    # ---- event plumbing -----------------------------------------------------------

    def on_raw_bar(self, raw: Any) -> None:
        try:
            bar = alpaca_bar_to_model(raw)
            for five in self._aggregator.push(bar):
                self._engine.on_five_minute_bar(five)
        except Exception as exc:  # noqa: BLE001 — a bad bar must not kill the loop
            _log.warning("bad live bar dropped: %s", exc)

    def _on_gap(self, exc: Exception) -> None:
        now = datetime.now(UTC)
        try:
            self._engine.journal.lifecycle(
                "data_gap", timestamp=now,
                trading_day=now.astimezone(ET).date(), reason=str(exc),
            )
        except Exception:  # noqa: BLE001
            _log.warning("could not journal data gap: %s", exc)

    # ---- lifecycle ------------------------------------------------------------------

    def request_stop(self, *, reason: str) -> None:
        self._engine.request_stop(reason=reason)
        self._stop.set()

    async def run(self) -> None:
        RUNNING[self._session["id"]] = self
        try:
            tasks = [
                asyncio.create_task(self._market.run(self._stop)),
                asyncio.create_task(self._trades.run(self._stop)),
                asyncio.create_task(self._ticker()),
            ]
            await self._stop.wait()
            for t in tasks:
                t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
        finally:
            RUNNING.pop(self._session["id"], None)

    async def _ticker(self) -> None:
        last_reconcile = datetime.now(UTC)
        while not self._stop.is_set():
            now = datetime.now(UTC)
            try:
                self._engine.on_tick(now)
                if (now - last_reconcile).total_seconds() >= self._reconcile_seconds:
                    last_reconcile = now
                    self._engine.reconcile(now)
            except Exception as exc:  # noqa: BLE001 — keep ticking
                _log.warning("tick error: %s", exc)
            await asyncio.sleep(self._tick_seconds)
