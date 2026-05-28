from intraday_trade_spy.clock import MarketClock
from intraday_trade_spy.config import Config
from intraday_trade_spy.models import RiskDecision, Signal
from intraday_trade_spy.risk.sizing import position_size
from intraday_trade_spy.risk.state import RiskState


class RiskManager:
    def __init__(self, cfg: Config, clock: MarketClock) -> None:
        self.cfg = cfg
        self.clock = clock

    def validate(self, sig: Signal, state: RiskState) -> RiskDecision:
        r = self.cfg.risk
        if sig.symbol != "SPY":
            return RiskDecision(approved=False, reason="non_spy_symbol")
        if state.open_position is not None:
            return RiskDecision(approved=False, reason="position_already_open")
        max_daily_loss_dollars = r.account_value * r.max_daily_loss_pct / 100
        if state.daily_lockout_active or state.daily_realized_pnl <= -max_daily_loss_dollars:
            return RiskDecision(approved=False, reason="daily_loss_limit_reached")
        if state.trades_taken_today >= r.max_trades_per_day:
            return RiskDecision(approved=False, reason="max_trades_per_day_reached")
        if state.consecutive_losses >= r.max_consecutive_losses:
            return RiskDecision(approved=False, reason="consecutive_losses_reached")
        if state.cooldown_until is not None and sig.timestamp < state.cooldown_until:
            return RiskDecision(approved=False, reason="cooldown_active")
        if not self.clock.allow_new_trades(sig.timestamp):
            return RiskDecision(approved=False, reason="no_new_trades_after")
        qty = position_size(
            account=r.account_value,
            risk_pct=r.max_risk_per_trade_pct,
            entry=sig.planned_entry,
            stop=sig.stop_loss,
        )
        if qty <= 0:
            return RiskDecision(approved=False, reason="position_size_zero")
        if qty * sig.planned_entry > r.account_value * r.max_position_value_pct / 100:
            return RiskDecision(approved=False, reason="position_value_exceeds_cap")
        risk_dollars = qty * (sig.planned_entry - sig.stop_loss)
        return RiskDecision(
            approved=True,
            reason="approved",
            quantity=qty,
            planned_risk_dollars=risk_dollars,
        )
