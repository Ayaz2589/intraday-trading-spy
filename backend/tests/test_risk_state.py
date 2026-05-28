from datetime import date, datetime
from zoneinfo import ZoneInfo

from intraday_trade_spy.risk.state import RiskState

ET = ZoneInfo("America/New_York")


def test_roll_to_session_clears_per_day_counters():
    st = RiskState(session_date=date(2026, 5, 27), account_value=1000.0)
    st.trades_taken_today = 2
    st.daily_realized_pnl = -8.5
    st.daily_lockout_active = True
    st.cooldown_until = datetime(2026, 5, 27, 15, 0, tzinfo=ET)
    st.roll_to_session(date(2026, 5, 28))
    assert st.session_date == date(2026, 5, 28)
    assert st.trades_taken_today == 0
    assert st.daily_realized_pnl == 0.0
    assert st.daily_lockout_active is False
    assert st.cooldown_until is None


def test_roll_to_session_is_noop_for_same_date():
    st = RiskState(session_date=date(2026, 5, 28), account_value=1000.0)
    st.trades_taken_today = 1
    st.roll_to_session(date(2026, 5, 28))
    assert st.trades_taken_today == 1


def test_roll_to_session_does_not_clear_consecutive_losses():
    st = RiskState(session_date=date(2026, 5, 27), account_value=1000.0)
    st.consecutive_losses = 2
    st.roll_to_session(date(2026, 5, 28))
    assert st.consecutive_losses == 2
