"""Feature 021 (research.md R1) — 1-minute → 5-minute bar aggregation.

The live stream delivers 1-minute SPY bars; the strategy decides on
completed 5-minute bars only (constitution timeframe). Buckets align to the
session grid (09:30, 09:35, … ET): a bucket emits exactly once, when a bar
from a LATER bucket (or session) arrives, or on explicit flush(). The
strategy can never observe a partial bar.
"""

from __future__ import annotations

from intraday_trade_spy.models import Bar

BUCKET_MINUTES = 5


def _bucket_start_minute(minute: int) -> int:
    return minute - (minute % BUCKET_MINUTES)


class BarAggregator:
    """Stateful, single-symbol, strictly-ordered 1m→5m aggregator."""

    def __init__(self) -> None:
        self._pending: list[Bar] = []

    def _bucket_key(self, bar: Bar) -> tuple:
        ts = bar.timestamp
        return (bar.session_date, ts.hour, _bucket_start_minute(ts.minute))

    def push(self, bar: Bar) -> list[Bar]:
        """Add a 1-minute bar; return any 5-minute bars completed by it."""
        if self._pending:
            last = self._pending[-1]
            if bar.timestamp <= last.timestamp:
                raise ValueError(
                    f"out-of-order bar: {bar.timestamp} after {last.timestamp}"
                )
            if self._bucket_key(bar) != self._bucket_key(last):
                emitted = self.flush()
                self._pending = [bar]
                return emitted
        self._pending.append(bar)
        return []

    def flush(self) -> list[Bar]:
        """Emit the open bucket (force-flat / session end). Idempotent."""
        if not self._pending:
            return []
        bars, self._pending = self._pending, []
        first, last = bars[0], bars[-1]
        ts = first.timestamp.replace(
            minute=_bucket_start_minute(first.timestamp.minute),
            second=0, microsecond=0,
        )
        return [Bar(
            symbol="SPY",
            timestamp=ts,
            open=first.open,
            high=max(b.high for b in bars),
            low=min(b.low for b in bars),
            close=last.close,
            volume=sum(b.volume for b in bars),
            session_date=first.session_date,
        )]
