from typing import Protocol

from intraday_trade_spy.models import Bar, IndicatorSnapshot, Signal


class Strategy(Protocol):
    def evaluate(self, bar: Bar, snapshot: IndicatorSnapshot) -> Signal | None: ...
