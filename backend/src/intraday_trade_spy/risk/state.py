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
