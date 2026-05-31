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


@pytest.fixture
def fixture_result(default_config_path, sample_csv_path, tmp_path):
    cfg = load_config(default_config_path)
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
    cfg = load_config(default_config_path)
    eng = BacktestEngine(cfg)
    result = eng.run(csv_path=sample_csv_path, output_dir=tmp_path)
    # If the per-session reset regresses, day 3 would not execute (locked
    # out after 2 consecutive losses) and total_trades would be 2 not 3.
    assert result.summary.total_trades == 3
