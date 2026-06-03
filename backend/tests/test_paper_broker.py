from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest

from intraday_trade_spy.broker.paper import PaperBroker
from intraday_trade_spy.models import Bar, Direction, Signal, TradePlan

ET = ZoneInfo("America/New_York")


def _bar(ts, o, h, lo, c):
    return Bar(
        symbol="SPY",
        timestamp=ts,
        open=o, high=h, low=lo, close=c,
        volume=1,
        session_date=date(ts.year, ts.month, ts.day),
    )


def _plan(entry=500.0, stop=499.0, target=502.0, qty=10):
    sig = Signal(
        symbol="SPY",
        setup="vwap_pullback_long",
        direction=Direction.LONG,
        timestamp=datetime(2026, 5, 28, 10, 15, tzinfo=ET),
        planned_entry=entry,
        stop_loss=stop,
        take_profit=target,
        reason="x",
    )
    return TradePlan(signal=sig, quantity=qty, planned_risk_dollars=qty * (entry - stop))


def test_entry_fills_at_next_bar_open():
    brk = PaperBroker()
    pos = brk.simulate_entry(
        _plan(),
        next_bar=_bar(datetime(2026, 5, 28, 10, 20, tzinfo=ET), 500.5, 501, 500.4, 500.8),
    )
    assert pos.entry_price == 500.5
    assert pos.exit_timestamp is None


def test_stop_fills_alone():
    brk = PaperBroker()
    plan = _plan(entry=500, stop=499, target=502, qty=10)
    pos = brk.simulate_entry(
        plan, next_bar=_bar(datetime(2026, 5, 28, 10, 20, tzinfo=ET), 500.0, 500.1, 499.9, 500.05)
    )
    pos = brk.simulate_bar(
        pos, _bar(datetime(2026, 5, 28, 10, 25, tzinfo=ET), 500.0, 500.1, 498.5, 499.0)
    )
    assert pos.exit_reason == "stop"
    assert pos.exit_price == 499
    assert pos.realized_r == -1.0
    assert pos.same_bar_tiebreak == "none"


def test_target_fills_alone():
    brk = PaperBroker()
    plan = _plan(entry=500, stop=499, target=502, qty=10)
    pos = brk.simulate_entry(
        plan, next_bar=_bar(datetime(2026, 5, 28, 10, 20, tzinfo=ET), 500.0, 500.1, 499.9, 500.05)
    )
    pos = brk.simulate_bar(
        pos, _bar(datetime(2026, 5, 28, 10, 25, tzinfo=ET), 500.0, 502.1, 499.8, 502.0)
    )
    assert pos.exit_reason == "target"
    assert pos.exit_price == 502
    # entry=500, stop=499, target=502 → R=2.0
    assert abs(pos.realized_r - 2.0) < 1e-9


def test_stop_fills_first_when_both_hit_same_bar():
    brk = PaperBroker()
    plan = _plan(entry=500, stop=499, target=502, qty=10)
    pos = brk.simulate_entry(
        plan, next_bar=_bar(datetime(2026, 5, 28, 10, 20, tzinfo=ET), 500.0, 500.1, 499.9, 500.05)
    )
    pos = brk.simulate_bar(
        pos, _bar(datetime(2026, 5, 28, 10, 25, tzinfo=ET), 500.0, 502.5, 498.5, 501.0)
    )
    assert pos.exit_reason == "stop"
    assert pos.same_bar_tiebreak == "stop_first"
    assert pos.realized_r == -1.0


def test_no_exit_when_neither_hit():
    brk = PaperBroker()
    plan = _plan(entry=500, stop=499, target=502, qty=10)
    pos = brk.simulate_entry(
        plan, next_bar=_bar(datetime(2026, 5, 28, 10, 20, tzinfo=ET), 500.0, 500.1, 499.9, 500.05)
    )
    pos = brk.simulate_bar(
        pos, _bar(datetime(2026, 5, 28, 10, 25, tzinfo=ET), 500.0, 501.5, 499.3, 500.5)
    )
    assert pos.exit_reason is None
    assert pos.exit_timestamp is None


def test_force_flat_closes_at_next_bar_open():
    brk = PaperBroker()
    plan = _plan(entry=500, stop=499, target=502, qty=10)
    pos = brk.simulate_entry(
        plan, next_bar=_bar(datetime(2026, 5, 28, 10, 20, tzinfo=ET), 500.0, 500.1, 499.9, 500.05)
    )
    next_bar = _bar(datetime(2026, 5, 28, 15, 55, tzinfo=ET), 500.7, 500.8, 500.5, 500.6)
    pos = brk.force_flat(pos, next_bar)
    assert pos.exit_reason == "force_flat"
    assert pos.exit_price == 500.7


# ---------- Feature 010 / US1: costs applied to fills ----------

_ENTRY_BAR = _bar(datetime(2026, 5, 28, 10, 20, tzinfo=ET), 500.0, 500.1, 499.9, 500.05)


def test_slippage_is_adverse_on_entry_and_target_exit():
    """T007: a long pays UP on entry and sells DOWN on exit — slippage never
    improves a fill."""
    brk = PaperBroker(slippage_per_share=0.01)
    plan = _plan(entry=500, stop=499, target=502, qty=10)
    pos = brk.simulate_entry(plan, next_bar=_ENTRY_BAR)
    assert pos.entry_price == pytest.approx(500.01)  # +slippage, paid up
    pos = brk.simulate_bar(
        pos, _bar(datetime(2026, 5, 28, 10, 25, tzinfo=ET), 500.0, 502.1, 499.8, 502.0)
    )
    assert pos.exit_reason == "target"
    assert pos.exit_price == pytest.approx(501.99)  # 502 − slippage, sold down
    assert pos.entry_price >= 500.0 and pos.exit_price <= 502.0


def test_slippage_is_adverse_on_stop_and_force_flat():
    """T007: stop and force-flat fills are also worsened by slippage."""
    brk = PaperBroker(slippage_per_share=0.01)
    plan = _plan(entry=500, stop=499, target=502, qty=10)
    pos = brk.simulate_entry(plan, next_bar=_ENTRY_BAR)
    p_stop = brk.simulate_bar(
        pos, _bar(datetime(2026, 5, 28, 10, 25, tzinfo=ET), 500.0, 500.1, 498.5, 499.0)
    )
    assert p_stop.exit_price == pytest.approx(498.99)  # 499 − slippage

    pos2 = brk.simulate_entry(plan, next_bar=_ENTRY_BAR)
    p_ff = brk.force_flat(
        pos2, _bar(datetime(2026, 5, 28, 15, 55, tzinfo=ET), 500.7, 500.8, 500.5, 500.6)
    )
    assert p_ff.exit_price == pytest.approx(500.69)  # 500.7 − slippage


def test_fees_deducted_both_sides_net_pnl_and_cost_fields():
    """T008: fees = fee_per_share × qty × 2; realized_pnl = gross − fees; the
    cost-breakdown fields are populated."""
    brk = PaperBroker(fees_per_share=0.005, slippage_per_share=0.0)
    plan = _plan(entry=500, stop=499, target=502, qty=10)
    pos = brk.simulate_entry(plan, next_bar=_ENTRY_BAR)
    pos = brk.simulate_bar(
        pos, _bar(datetime(2026, 5, 28, 10, 25, tzinfo=ET), 500.0, 502.1, 499.8, 502.0)
    )
    assert pos.gross_pnl == pytest.approx(20.0)  # (502 − 500) × 10, zero slip
    assert pos.fees == pytest.approx(0.005 * 10 * 2)  # 0.10
    assert pos.slippage_cost == pytest.approx(0.0)
    assert pos.realized_pnl == pytest.approx(20.0 - 0.10)  # net


def test_combined_slippage_and_fees_exact():
    """T008: exact hand-computed net with both costs on."""
    brk = PaperBroker(fees_per_share=0.01, slippage_per_share=0.02)
    plan = _plan(entry=500, stop=499, target=502, qty=10)
    pos = brk.simulate_entry(plan, next_bar=_ENTRY_BAR)  # entry 500.02
    pos = brk.simulate_bar(
        pos, _bar(datetime(2026, 5, 28, 10, 25, tzinfo=ET), 500.0, 502.1, 499.8, 502.0)
    )
    # exit 501.98; gross = (501.98 − 500.02) × 10 = 19.6
    assert pos.gross_pnl == pytest.approx(19.6)
    assert pos.slippage_cost == pytest.approx(0.02 * 10 * 2)  # 0.40
    assert pos.fees == pytest.approx(0.01 * 10 * 2)  # 0.20
    assert pos.realized_pnl == pytest.approx(19.6 - 0.20)  # 19.40


def test_force_flat_exit_is_net_of_costs():
    """T010(b): a force-flat exit also carries fees + slippage in its net PnL."""
    brk = PaperBroker(fees_per_share=0.01, slippage_per_share=0.02)
    plan = _plan(entry=500, stop=499, target=502, qty=10)
    pos = brk.simulate_entry(plan, next_bar=_ENTRY_BAR)  # entry 500.02
    pos = brk.force_flat(
        pos, _bar(datetime(2026, 5, 28, 15, 55, tzinfo=ET), 500.7, 500.8, 500.5, 500.6)
    )
    # exit 500.68; gross = (500.68 − 500.02) × 10 = 6.6
    assert pos.exit_reason == "force_flat"
    assert pos.gross_pnl == pytest.approx(6.6)
    assert pos.fees == pytest.approx(0.2)
    assert pos.slippage_cost == pytest.approx(0.4)
    assert pos.realized_pnl == pytest.approx(6.6 - 0.2)
