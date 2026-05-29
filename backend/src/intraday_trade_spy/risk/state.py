from dataclasses import dataclass
from datetime import date, datetime

from intraday_trade_spy.models import Position


@dataclass
class RiskState:
    session_date: date
    account_value: float
    trades_taken_today: int = 0
    consecutive_losses: int = 0
    cooldown_until: datetime | None = None
    daily_realized_pnl: float = 0.0
    open_position: Position | None = None
    daily_lockout_active: bool = False

    def roll_to_session(self, new_date: date) -> None:
        if new_date != self.session_date:
            self.session_date = new_date
            self.trades_taken_today = 0
            self.daily_realized_pnl = 0.0
            self.daily_lockout_active = False
            self.cooldown_until = None
            # Reset consecutive_losses per session. Originally this was
            # intentionally NOT reset (so the lockout was "trailing"
            # across sessions), but that created a catch-22 — once the
            # lockout fired, every signal was rejected, so no winning
            # trade could ever happen to reset the counter, so the
            # lockout was permanent. Discovered during the real-data
            # preset sweep (see EXPERIMENTS.md Experiment 004).
            self.consecutive_losses = 0
