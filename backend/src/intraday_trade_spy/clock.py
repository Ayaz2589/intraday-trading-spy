from dataclasses import dataclass
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")


@dataclass(frozen=True)
class MarketClock:
    session_start: time
    session_end: time
    no_new_trades_after: time
    force_flat_time: time

    def _et(self, dt: datetime) -> datetime:
        return dt if dt.tzinfo == ET else dt.astimezone(ET)

    def is_market_open(self, dt: datetime) -> bool:
        t = self._et(dt).time()
        return self.session_start <= t < self.session_end

    def is_or_complete(self, dt: datetime, or_minutes: int) -> bool:
        t = self._et(dt).time()
        cutoff = (
            datetime.combine(datetime.today(), self.session_start)
            + timedelta(minutes=or_minutes)
        ).time()
        return t >= cutoff

    def allow_new_trades(self, dt: datetime) -> bool:
        t = self._et(dt).time()
        return self.session_start <= t < self.no_new_trades_after

    def is_force_flat(self, dt: datetime) -> bool:
        t = self._et(dt).time()
        return t >= self.force_flat_time
