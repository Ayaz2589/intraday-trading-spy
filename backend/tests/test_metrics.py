import math
import statistics
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from pytest import approx

from intraday_trade_spy.backtest.metrics import compute_summary
from intraday_trade_spy.models import JournalEntry, SignalStatus

ET = ZoneInfo("America/New_York")


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


# ---------- Feature 010 / US2 helpers: build executed+exit trade pairs ----------

_seq = 0


def _trade(entry_ts, exit_ts, *, exit_reason, net_pnl, realized_r, fees=0.0, slippage_cost=0.0):
    """One trade = an EXECUTED row (entry time) + an exit row (exit time, net
    PnL). The engine holds one position at a time, so chronological pairing of
    executed↔exit rows is exact."""
    global _seq
    e = JournalEntry(
        row_seq=_seq, timestamp=entry_ts, status=SignalStatus.EXECUTED, reason="",
    )
    _seq += 1
    status = SignalStatus.FORCE_FLAT if exit_reason == "force_flat" else SignalStatus.EXITED
    x = JournalEntry(
        row_seq=_seq, timestamp=exit_ts, status=status, reason="",
        exit_reason=exit_reason, realized_pnl=net_pnl, realized_r=realized_r,
        gross_pnl=net_pnl + fees, fees=fees, slippage_cost=slippage_cost,
    )
    _seq += 1
    return [e, x]


def _at(y, m, d, hh, mm=0):
    return datetime(y, m, d, hh, mm, tzinfo=ET)


def test_expectancy_r_and_dollars():
    """T015: expectancy in R and in $ over net results."""
    rows = []
    # 2 wins (+2R, $200), 2 losses (−1R, −$100)
    rows += _trade(_at(2026, 4, 1, 10), _at(2026, 4, 1, 11), exit_reason="target", net_pnl=200.0, realized_r=2.0)
    rows += _trade(_at(2026, 4, 2, 10), _at(2026, 4, 2, 11), exit_reason="target", net_pnl=200.0, realized_r=2.0)
    rows += _trade(_at(2026, 4, 3, 10), _at(2026, 4, 3, 11), exit_reason="stop", net_pnl=-100.0, realized_r=-1.0)
    rows += _trade(_at(2026, 4, 6, 10), _at(2026, 4, 6, 11), exit_reason="stop", net_pnl=-100.0, realized_r=-1.0)
    s = compute_summary(rows)
    # win_rate 0.5, avg_win_r 2.0, loss_rate 0.5, avg_loss_r −1.0
    assert s.expectancy_r == approx(0.5 * 2.0 - 0.5 * 1.0)  # 0.5
    assert s.expectancy_dollars == approx((200 + 200 - 100 - 100) / 4)  # 50.0


def test_equity_curve_and_drawdown_dollars_and_pct():
    """T016: equity curve anchored on account_value; drawdown in $ and %."""
    av = 25000.0
    rows = []
    rows += _trade(_at(2026, 4, 1, 10), _at(2026, 4, 1, 11), exit_reason="target", net_pnl=100.0, realized_r=1.0)
    rows += _trade(_at(2026, 4, 2, 10), _at(2026, 4, 2, 11), exit_reason="stop", net_pnl=-300.0, realized_r=-1.0)
    rows += _trade(_at(2026, 4, 3, 10), _at(2026, 4, 3, 11), exit_reason="target", net_pnl=50.0, realized_r=0.5)
    s = compute_summary(rows, account_value=av)
    # equity: 25000(seed) → 25100 → 24800 → 24850 ; peak 25100
    assert len(s.equity_curve) == 4
    assert s.equity_curve[0].equity == approx(av)
    assert s.equity_curve[0].timestamp is None
    assert s.equity_curve[-1].equity == approx(24850.0)
    assert s.max_drawdown_dollars == approx(300.0)
    assert s.max_drawdown_pct == approx(300.0 / 25100.0)


def test_sharpe_and_sortino_daily_returns():
    """T017: daily-return Sharpe/Sortino, rf=0, ×√252."""
    av = 25000.0
    rows = []
    rows += _trade(_at(2026, 4, 1, 10), _at(2026, 4, 1, 11), exit_reason="target", net_pnl=250.0, realized_r=2.0)
    rows += _trade(_at(2026, 4, 2, 10), _at(2026, 4, 2, 11), exit_reason="stop", net_pnl=-100.0, realized_r=-1.0)
    rows += _trade(_at(2026, 4, 3, 10), _at(2026, 4, 3, 11), exit_reason="target", net_pnl=150.0, realized_r=1.0)
    s = compute_summary(rows, account_value=av)
    daily = [250.0 / av, -100.0 / av, 150.0 / av]
    mean = statistics.mean(daily)
    exp_sharpe = mean / statistics.stdev(daily) * math.sqrt(252)
    downside = math.sqrt(sum(min(r, 0.0) ** 2 for r in daily) / len(daily))
    exp_sortino = mean / downside * math.sqrt(252)
    assert s.sharpe == approx(exp_sharpe)
    assert s.sortino == approx(exp_sortino)


def test_return_distribution():
    """T018: median, sample std, Fisher-Pearson skew over net per-trade $."""
    series = [10.0, 20.0, 30.0, 40.0, 1000.0]  # right-skewed
    rows = []
    for i, p in enumerate(series):
        d = i + 1
        rows += _trade(_at(2026, 4, d, 10), _at(2026, 4, d, 11), exit_reason="target", net_pnl=p, realized_r=1.0)
    s = compute_summary(rows)
    assert s.return_median_dollars == approx(statistics.median(series))
    assert s.return_std_dollars == approx(statistics.stdev(series))
    assert s.return_skew is not None and s.return_skew > 0  # right tail


def test_per_bucket_breakdown_by_entry_time_ny():
    """T019: hour/weekday/month buckets keyed off NY-local entry time; counts
    sum to the trade count."""
    rows = []
    # 2 trades entered 10:00 ET, 1 at 14:00 ET — all on 2026-04-01 (a Wednesday)
    rows += _trade(_at(2026, 4, 1, 10), _at(2026, 4, 1, 11), exit_reason="target", net_pnl=100.0, realized_r=2.0)
    rows += _trade(_at(2026, 4, 1, 10, 30), _at(2026, 4, 1, 12), exit_reason="stop", net_pnl=-50.0, realized_r=-1.0)
    rows += _trade(_at(2026, 4, 1, 14), _at(2026, 4, 1, 15), exit_reason="target", net_pnl=80.0, realized_r=1.6)
    s = compute_summary(rows)
    hours = {b.key: b for b in s.hour_buckets}
    assert hours["10"].trade_count == 2
    assert hours["14"].trade_count == 1
    assert sum(b.trade_count for b in s.hour_buckets) == 3
    assert sum(b.trade_count for b in s.weekday_buckets) == 3
    assert sum(b.trade_count for b in s.month_buckets) == 3
    # April = month 4
    months = {b.key: b for b in s.month_buckets}
    assert months["4"].trade_count == 3


def test_metrics_degenerate_inputs_return_none():
    """T020: 0/1-trade and all-loss inputs degrade gracefully (no div-by-zero)."""
    s0 = compute_summary([])
    assert s0.expectancy_r is None
    assert s0.sharpe is None and s0.sortino is None
    assert s0.max_drawdown_pct is None
    assert s0.return_median_dollars is None
    assert s0.return_std_dollars is None
    assert s0.return_skew is None

    one = _trade(_at(2026, 4, 1, 10), _at(2026, 4, 1, 11), exit_reason="target", net_pnl=100.0, realized_r=2.0)
    s1 = compute_summary(one)
    assert s1.expectancy_r is not None
    assert s1.sharpe is None  # need ≥2 trading days
    assert s1.return_std_dollars is None  # need ≥2 points
    assert s1.return_skew is None  # need ≥3 points

    # all wins → no downside → Sortino undefined (not 0/inf)
    allwin = []
    allwin += _trade(_at(2026, 4, 1, 10), _at(2026, 4, 1, 11), exit_reason="target", net_pnl=100.0, realized_r=2.0)
    allwin += _trade(_at(2026, 4, 2, 10), _at(2026, 4, 2, 11), exit_reason="target", net_pnl=120.0, realized_r=2.0)
    s_aw = compute_summary(allwin, account_value=25000.0)
    assert s_aw.sortino is None


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
