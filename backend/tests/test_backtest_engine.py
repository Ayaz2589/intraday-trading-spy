"""Backtest engine integration tests.

The unit tests for indicators, strategy, risk manager, and broker each verify
their slice in isolation. These tests pin the engine's *composed* behavior
against the canonical fixture so changes to wiring or state-transition logic
are caught even if every individual module's tests still pass.

Fixture: backend/tests/fixtures/spy_5m_sample.csv — 3 sessions (May 26-28
2026), 235 bars. With the default config it produces exactly 3 trades:
+2R, -1R, -1R (net 0R).
"""

import pytest

from intraday_trade_spy.backtest.engine import BacktestEngine
from intraday_trade_spy.config import load_config


def test_engine_runs_on_fixture(default_config_path, sample_csv_path, tmp_path):
    cfg = load_config(default_config_path)
    eng = BacktestEngine(cfg)
    result = eng.run(csv_path=sample_csv_path, output_dir=tmp_path)
    assert any(r.status.value == "emitted" for r in result.journal_rows)
    assert any(r.status.value == "rejected" for r in result.journal_rows)
    assert result.summary.total_trades >= 0


def test_lockout_or_max_trades_reached(default_config_path, sample_csv_path, tmp_path):
    """T057 (Phase 4 / US2): With permissive position cap so trades execute,
    the fixture produces either a daily_loss_limit_reached lockout or
    max_trades_per_day_reached rejection."""
    cfg = load_config(default_config_path)
    cfg = cfg.model_copy(
        update={
            "risk": cfg.risk.model_copy(
                update={"max_position_value_pct": 1000.0, "max_trades_per_day": 1}
            )
        }
    )
    eng = BacktestEngine(cfg)
    result = eng.run(csv_path=sample_csv_path, output_dir=tmp_path)
    rejections = [r for r in result.journal_rows if r.status.value == "rejected"]
    reasons = {r.rejection_check for r in rejections}
    assert reasons & {"daily_loss_limit_reached", "max_trades_per_day_reached"}


# ----------- Golden-fixture tests ----------------------------------------


def _zero_cost(cfg):
    """Feature 010: the golden R-structure tests measure strategy/engine logic
    in R terms, which must be cost-free to stay stable. Cost behavior has its
    own tests (test_paper_broker.py, test_cost_fixture.py, and below)."""
    return cfg.model_copy(
        update={
            "broker": cfg.broker.model_copy(
                update={"fees_per_share": 0.0, "slippage_per_share": 0.0}
            )
        }
    )


def _legacy_default(cfg):
    """Feature 012 raised the shipped default's position-value cap (100->400) so
    configs can trade at higher risk. These golden/cost assertions were authored
    at the cap=100 sizing (qty 44 on the fixture); pin it so they keep testing
    engine LOGIC at a fixed scenario, decoupled from the now-tunable default."""
    return cfg.model_copy(
        update={"risk": cfg.risk.model_copy(update={"max_position_value_pct": 100.0})}
    )


@pytest.fixture
def fixture_result(default_config_path, sample_csv_path, tmp_path):
    cfg = _zero_cost(_legacy_default(load_config(default_config_path)))
    return BacktestEngine(cfg).run(csv_path=sample_csv_path, output_dir=tmp_path)


def test_golden_summary_pnl(fixture_result):
    """The fixture produces exactly 3 trades: one +2R win, two -1R losses,
    net 0R. This pins the engine end-to-end against a known scenario; if
    indicators, strategy entry conditions, sizing, broker fills, or any
    state transition silently change, total_r / wins / losses will drift."""
    s = fixture_result.summary
    assert s.total_trades == 3
    assert s.wins == 1
    assert s.losses == 2
    assert s.total_r == pytest.approx(0.0, abs=1e-9)
    assert s.average_r == pytest.approx(0.0, abs=1e-9)
    assert s.max_drawdown_r == pytest.approx(-2.0, abs=1e-9)


def test_golden_exit_sequence(fixture_result):
    """Pin entry/exit prices and R-multiples for each of the 3 trades.
    A change to broker fill logic (e.g. fill-at-close instead of fill-at-
    next-open) or VWAP-pullback entry threshold will break this."""
    executions = [
        r for r in fixture_result.journal_rows
        if r.status.value in ("executed", "exited")
    ]
    # 3 executed entries + 3 exits = 6 rows
    assert len(executions) == 6

    entries = [r for r in executions if r.status.value == "executed"]
    exits = [r for r in executions if r.status.value == "exited"]
    assert [e.timestamp.date().isoformat() for e in entries] == [
        "2026-05-26", "2026-05-27", "2026-05-28",
    ]
    # Same entry mechanics → same quantities across days
    assert all(e.quantity == 44 for e in entries)

    assert exits[0].exit_reason == "target"
    assert exits[0].realized_r == pytest.approx(2.0, abs=1e-9)
    assert exits[1].exit_reason == "stop"
    assert exits[1].realized_r == pytest.approx(-1.0, abs=1e-9)
    assert exits[2].exit_reason == "stop"
    assert exits[2].realized_r == pytest.approx(-1.0, abs=1e-9)


def test_golden_rejection_breakdown(fixture_result):
    """Pin the rejection counts. The fixture's 117 rejected signals split:
    99 = position_value_exceeds_cap (default cap is 100% so very few signals
    fit), 18 = no_new_trades_after (signals past 15:30 ET cutoff).
    A change to risk-manager rejection ordering or to the cutoff time will
    shift these counts."""
    breakdown = fixture_result.summary.rejection_breakdown
    assert fixture_result.summary.rejected_signal_count == 117
    assert breakdown.get("position_value_exceeds_cap") == 99
    assert breakdown.get("no_new_trades_after") == 18


def test_no_signal_executed_on_last_bar(default_config_path, sample_csv_path, tmp_path):
    """Engine guard at engine.py:104 (`idx + 1 < len(bars)`) prevents
    executing a signal that has no next bar to fill on. Verify no
    'executed' row exists at the last bar's timestamp."""
    cfg = load_config(default_config_path)
    cfg = cfg.model_copy(
        update={"risk": cfg.risk.model_copy(update={"max_position_value_pct": 1000.0})}
    )
    eng = BacktestEngine(cfg)
    result = eng.run(csv_path=sample_csv_path, output_dir=tmp_path)
    last_bar_ts = max(r.timestamp for r in result.journal_rows)
    executed_at_last = [
        r for r in result.journal_rows
        if r.status.value == "executed" and r.timestamp == last_bar_ts
    ]
    assert executed_at_last == []


def test_consecutive_losses_increment_then_reset_across_sessions(
    default_config_path, sample_csv_path, tmp_path
):
    """The fixture's exit sequence is W L L. After session 2's loss,
    consecutive_losses should be 1; after session 3's loss, it should be 1
    again (per-session reset on roll_to_session). If RiskState.roll_to_session
    silently drops the consecutive-loss reset (the Experiment 004 bug
    re-emerging), one of these days would lock out and we'd see fewer trades."""
    cfg = _legacy_default(load_config(default_config_path))
    eng = BacktestEngine(cfg)
    result = eng.run(csv_path=sample_csv_path, output_dir=tmp_path)
    # If the per-session reset regresses, day 3 would not execute (locked
    # out after 2 consecutive losses) and total_trades would be 2 not 3.
    assert result.summary.total_trades == 3


# ----------- Feature 010 / US1: cost application ------------------------


def test_costs_reduce_pnl_by_exact_modeled_amount(
    default_config_path, sample_csv_path, tmp_path
):
    """SC-001: net total = zero-cost total − total modeled cost, and the gap
    equals total_fees + total_slippage (here 3 trades × 44 × $0.01 × 2 = $2.64)."""
    cfg = _legacy_default(load_config(default_config_path))
    s_cost = BacktestEngine(cfg).run(csv_path=sample_csv_path, output_dir=tmp_path).summary
    s_zero = BacktestEngine(_zero_cost(cfg)).run(
        csv_path=sample_csv_path, output_dir=tmp_path
    ).summary

    gap = s_zero.total_pnl_dollars - s_cost.total_pnl_dollars
    assert gap == pytest.approx(
        s_cost.total_fees_dollars + s_cost.total_slippage_dollars, abs=1e-9
    )
    assert gap == pytest.approx(2.64, abs=1e-9)
    # zero-cost run records no cost
    assert s_zero.total_slippage_dollars == pytest.approx(0.0, abs=1e-12)
    assert s_zero.total_fees_dollars == pytest.approx(0.0, abs=1e-12)


def test_lockout_uses_net_realized_pnl(default_config_path):
    """T011: the daily-loss lockout accumulates NET realized PnL, so costs make
    it trip earlier (never later) — strengthening the risk veto (constitution III)."""
    from datetime import date, datetime
    from zoneinfo import ZoneInfo

    from intraday_trade_spy.models import Direction, Position, Signal, TradePlan
    from intraday_trade_spy.risk.state import RiskState

    et = ZoneInfo("America/New_York")
    cfg = load_config(default_config_path)
    # account 25,000 × 0.01% = $2.50 daily-loss budget.
    cfg = cfg.model_copy(
        update={"risk": cfg.risk.model_copy(update={"max_daily_loss_pct": 0.01})}
    )
    eng = BacktestEngine(cfg)
    state = RiskState(session_date=date(2026, 5, 28), account_value=cfg.risk.account_value)

    sig = Signal(
        symbol="SPY", setup="vwap_pullback_long", direction=Direction.LONG,
        timestamp=datetime(2026, 5, 28, 10, 0, tzinfo=et),
        planned_entry=500.0, stop_loss=499.0, take_profit=502.0, reason="x",
    )
    plan = TradePlan(signal=sig, quantity=10, planned_risk_dollars=10.0)
    pos = Position(
        plan=plan,
        entry_timestamp=datetime(2026, 5, 28, 10, 5, tzinfo=et),
        entry_price=500.0,
        exit_timestamp=datetime(2026, 5, 28, 10, 30, tzinfo=et),
        exit_price=499.7,
        exit_reason="stop",
        realized_pnl=-3.0,  # NET loss > $2.50 budget
        realized_r=-1.0,
        gross_pnl=-2.0,
        fees=0.0,
        slippage_cost=1.0,
    )
    eng._apply_exit_to_state(state, pos)
    assert state.daily_realized_pnl == pytest.approx(-3.0)  # net, not gross −2.0
    assert state.daily_lockout_active is True
