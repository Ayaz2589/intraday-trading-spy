from typing import Protocol

from intraday_trade_spy.models import Bar, IndicatorSnapshot, Signal, WindowSkip


class Strategy(Protocol):
    def evaluate(
        self, bar: Bar, snapshot: IndicatorSnapshot, minutes_since_open: int
    ) -> Signal | WindowSkip | None: ...
