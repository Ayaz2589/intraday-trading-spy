"""Feature 021 (research.md R3) — the live session's bar state.

Holds the current session's completed 5-minute bars and recomputes the
EXISTING vectorized indicators over the whole session on each append
(≤78 rows — trivially cheap). One indicator code path for backtest and
live; parity is enforced by a golden test."""

from __future__ import annotations

from collections.abc import Iterable

import pandas as pd

from intraday_trade_spy.data.indicators import attach_indicators, snapshot_from_row
from intraday_trade_spy.models import Bar, IndicatorSnapshot


def _row(bar: Bar) -> dict:
    return {
        "timestamp": bar.timestamp, "open": bar.open, "high": bar.high,
        "low": bar.low, "close": bar.close, "volume": bar.volume,
        "session_date": bar.session_date,
    }


class SessionState:
    def __init__(self, *, or_minutes: int) -> None:
        self._or_minutes = or_minutes
        self._bars: list[Bar] = []

    @property
    def bar_count(self) -> int:
        return len(self._bars)

    @property
    def last_bar(self) -> Bar | None:
        return self._bars[-1] if self._bars else None

    def warmup(self, bars: Iterable[Bar]) -> None:
        """Load the session's earlier bars (automation started mid-session —
        without this, session-anchored VWAP/OR would be silently wrong)."""
        for bar in bars:
            self._push(bar)

    def append(self, bar: Bar) -> IndicatorSnapshot:
        """Add a completed 5m bar; return the indicator snapshot for it."""
        self._push(bar)
        df = attach_indicators(
            pd.DataFrame([_row(b) for b in self._bars]),
            or_minutes=self._or_minutes,
        )
        return snapshot_from_row(df.iloc[-1])

    def _push(self, bar: Bar) -> None:
        if self._bars and bar.session_date != self._bars[-1].session_date:
            self._bars = []  # new session — fresh VWAP/OR
        self._bars.append(bar)
