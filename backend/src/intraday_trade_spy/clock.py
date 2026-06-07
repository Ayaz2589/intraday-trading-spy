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
        et = self._et(dt)
        if et.weekday() >= 5:  # Sat/Sun — live loops ask about NOW, not bars
            return False
        t = et.time()
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

    def minutes_since_open(self, dt: datetime) -> int:
        """Whole minutes since session_start, in ET (Feature 020: the entry
        window's single time source). Negative before the open."""
        t = self._et(dt).time()
        return (t.hour * 60 + t.minute) - (
            self.session_start.hour * 60 + self.session_start.minute
        )

    def is_force_flat(self, dt: datetime) -> bool:
        t = self._et(dt).time()
        return t >= self.force_flat_time
