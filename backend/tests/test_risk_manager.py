from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from intraday_trade_spy.clock import MarketClock
from intraday_trade_spy.config import (
    BrokerConfig,
    Config,
    DataConfig,
    MarketConfig,
    RiskConfig,
)
from intraday_trade_spy.models import Direction, Signal
from intraday_trade_spy.risk.manager import RiskManager
from intraday_trade_spy.risk.state import RiskState

ET = ZoneInfo("America/New_York")


def _cfg(**risk_overrides):
    return Config(
        market=MarketConfig(
            symbol="SPY",
            session_start="09:30:00",
            session_end="16:00:00",
            no_new_trades_after="15:30:00",
            force_flat_time="15:55:00",
        ),
        data=DataConfig(csv_path="x", output_dir="y"),
        risk=RiskConfig(**({"account_value": 1000.0, **risk_overrides})),
        broker=BrokerConfig(provider="paper", live_auto_enabled=False),
    )


def _clock():
    return MarketClock(time(9, 30), time(16, 0), time(15, 30), time(15, 55))


def _state(**overrides):
    s = RiskState(session_date=date(2026, 5, 28), account_value=1000.0)
    for k, v in overrides.items():
        setattr(s, k, v)
    return s


def _sig(ts=None, entry=500.0, stop=499.0, target=502.0):
    return Signal(
        symbol="SPY",
        setup="vwap_pullback_long",
        direction=Direction.LONG,
        timestamp=ts or datetime(2026, 5, 28, 10, 15, tzinfo=ET),
        planned_entry=entry,
        stop_loss=stop,
        take_profit=target,
        reason="x",
    )


def test_approves_clean_signal():
    # Default cap is 25% of $1000 = $250; raise it so 10 shares × $500 fits.
    mgr = RiskManager(_cfg(max_position_value_pct=600.0), _clock())
    dec = mgr.validate(_sig(), _state())
    assert dec.approved is True
    assert dec.quantity == 10
    assert dec.reason == "approved"


def test_rejects_position_already_open():
    mgr = RiskManager(_cfg(), _clock())
    # Build a phony open position by passing a sentinel; the manager just checks for not-None.
    from intraday_trade_spy.models import Position, TradePlan
    plan = TradePlan(signal=_sig(), quantity=1, planned_risk_dollars=1.0)
    pos = Position(
        plan=plan,
        entry_timestamp=datetime(2026, 5, 28, 10, 0, tzinfo=ET),
        entry_price=500.0,
    )
    dec = mgr.validate(_sig(), _state(open_position=pos))
    assert dec.approved is False
    assert dec.reason == "position_already_open"


def test_rejects_daily_loss_limit_active_flag():
    mgr = RiskManager(_cfg(), _clock())
    dec = mgr.validate(_sig(), _state(daily_lockout_active=True))
    assert dec.approved is False
    assert dec.reason == "daily_loss_limit_reached"


def test_rejects_daily_loss_limit_by_pnl():
    mgr = RiskManager(_cfg(), _clock())
    # account 1000 × 2% = $20 max daily loss
    dec = mgr.validate(_sig(), _state(daily_realized_pnl=-25.0))
    assert dec.approved is False
    assert dec.reason == "daily_loss_limit_reached"


def test_rejects_max_trades_per_day():
    mgr = RiskManager(_cfg(), _clock())
    dec = mgr.validate(_sig(), _state(trades_taken_today=3))
    assert dec.approved is False
    assert dec.reason == "max_trades_per_day_reached"


def test_rejects_consecutive_losses():
    mgr = RiskManager(_cfg(), _clock())
    dec = mgr.validate(_sig(), _state(consecutive_losses=2))
    assert dec.approved is False
    assert dec.reason == "consecutive_losses_reached"


def test_rejects_cooldown_active():
    mgr = RiskManager(_cfg(), _clock())
    sig_ts = datetime(2026, 5, 28, 10, 0, tzinfo=ET)
    cooldown_until = sig_ts + timedelta(minutes=10)
    dec = mgr.validate(_sig(ts=sig_ts), _state(cooldown_until=cooldown_until))
    assert dec.approved is False
    assert dec.reason == "cooldown_active"


def test_rejects_no_new_trades_after():
    mgr = RiskManager(_cfg(), _clock())
    sig_ts = datetime(2026, 5, 28, 15, 35, tzinfo=ET)  # past 15:30 cutoff
    dec = mgr.validate(_sig(ts=sig_ts), _state())
    assert dec.approved is False
    assert dec.reason == "no_new_trades_after"


def test_rejects_position_size_zero():
    mgr = RiskManager(_cfg(), _clock())
    # risk_per_share = 11, max_risk = $10 → floor(10/11) = 0 shares
    dec = mgr.validate(_sig(entry=100.0, stop=89.0, target=110.0), _state())
    assert dec.approved is False
    assert dec.reason == "position_size_zero"


def test_rejects_position_value_exceeds_cap():
    # 25% of 1000 = 250 cap. Entry $500 × qty 10 = $5000 > $250.
    mgr = RiskManager(_cfg(max_position_value_pct=25.0), _clock())
    dec = mgr.validate(_sig(), _state())
    assert dec.approved is False
    assert dec.reason == "position_value_exceeds_cap"
