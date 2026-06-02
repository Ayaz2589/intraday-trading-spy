from datetime import datetime, timezone

from pytest import approx

from intraday_trade_spy.backtest.metrics import compute_summary
from intraday_trade_spy.models import JournalEntry, SignalStatus


def _entry(seq, status, *, exit_reason=None, realized_pnl=None, realized_r=None):
    return JournalEntry(
        row_seq=seq,
        timestamp=datetime(2026, 4, 1, 9, 30, tzinfo=timezone.utc),
        status=status,
        reason="",
        exit_reason=exit_reason,
        realized_pnl=realized_pnl,
        realized_r=realized_r,
    )


def test_summary_empty_journal():
    s = compute_summary([])
    assert s.total_trades == 0
    assert s.win_rate == 0.0
    assert s.profit_factor is None
    assert s.rejected_signal_count == 0
    assert s.rejection_breakdown == {}
    assert s.total_pnl_dollars == 0.0


def test_summary_sums_realized_pnl_over_completed_trades():
    rows = [
        _entry(0, SignalStatus.EXECUTED),
        _entry(1, SignalStatus.EXITED, exit_reason="target", realized_pnl=120.50, realized_r=1.0),
        _entry(2, SignalStatus.EXITED, exit_reason="stop", realized_pnl=-60.25, realized_r=-1.0),
        # Force-flat counts toward total_pnl_dollars, mirroring total_r.
        _entry(3, SignalStatus.FORCE_FLAT, exit_reason="force_flat", realized_pnl=15.00, realized_r=0.2),
    ]
    s = compute_summary(rows)
    assert s.total_pnl_dollars == approx(120.50 - 60.25 + 15.00)
