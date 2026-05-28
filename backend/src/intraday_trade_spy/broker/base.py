from typing import Protocol

from intraday_trade_spy.models import Bar, Position, TradePlan


class Broker(Protocol):
    def simulate_entry(self, plan: TradePlan, *, next_bar: Bar) -> Position: ...

    def simulate_bar(self, position: Position, bar: Bar) -> Position: ...
