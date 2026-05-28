from intraday_trade_spy.backtest.metrics import compute_summary


def test_summary_empty_journal():
    s = compute_summary([])
    assert s.total_trades == 0
    assert s.win_rate == 0.0
    assert s.profit_factor is None
    assert s.rejected_signal_count == 0
    assert s.rejection_breakdown == {}
