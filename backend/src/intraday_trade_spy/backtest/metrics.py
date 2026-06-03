from collections import Counter

from intraday_trade_spy.models import JournalEntry, SignalStatus, SummaryMetrics


def compute_summary(rows: list[JournalEntry]) -> SummaryMetrics:
    executed = [r for r in rows if r.status == SignalStatus.EXECUTED]
    exited = [r for r in rows if r.status == SignalStatus.EXITED]
    force_flatted = [r for r in rows if r.status == SignalStatus.FORCE_FLAT]
    # All completed trades (decisive + force-flat) contribute to total_r,
    # avg_r, drawdown, best/worst. wins/losses are decisive outcomes only;
    # force-flat is neither a win nor a loss for those buckets.
    completed = exited + force_flatted
    wins = [r for r in exited if r.exit_reason == "target"]
    losses = [r for r in exited if r.exit_reason == "stop"]
    rejections = [r for r in rows if r.status == SignalStatus.REJECTED]

    total_trades = len(executed)
    win_rate = (len(wins) / total_trades) if total_trades else 0.0
    avg_win_r = sum(r.realized_r for r in wins) / len(wins) if wins else 0.0
    avg_loss_r = sum(r.realized_r for r in losses) / len(losses) if losses else 0.0
    all_r = [r.realized_r for r in completed if r.realized_r is not None]
    avg_r = sum(all_r) / len(all_r) if all_r else 0.0
    total_r = sum(all_r)
    # Dollar PnL over the same completed set as total_r. Per-trade realized_pnl
    # is computed by the engine; this is the aggregate the cloud summary's `pnl`
    # field reads (via total_pnl_dollars) — previously never produced, so PnL
    # always showed $0.
    total_pnl_dollars = sum(r.realized_pnl for r in completed if r.realized_pnl is not None)
    # Feature 010: realized_pnl is NET of costs. Surface the net total under an
    # explicit name plus the cost components that produced it.
    total_net_pnl_dollars = total_pnl_dollars
    total_fees_dollars = sum(r.fees for r in completed if r.fees is not None)
    total_slippage_dollars = sum(
        r.slippage_cost for r in completed if r.slippage_cost is not None
    )

    pf: float | None = None
    if wins and losses:
        pf = sum(r.realized_r for r in wins) / abs(sum(r.realized_r for r in losses))
    elif wins and not losses:
        pf = None  # undefined when there are wins but no losses

    cum = 0.0
    peak = 0.0
    max_dd = 0.0
    for r in all_r:
        cum += r
        peak = max(peak, cum)
        max_dd = min(max_dd, cum - peak)

    best = max(all_r) if all_r else None
    worst = min(all_r) if all_r else None

    streak = cur = 0
    for r in completed:
        if r.exit_reason == "stop":
            cur += 1
            streak = max(streak, cur)
        else:
            cur = 0

    breakdown = dict(Counter(r.rejection_check for r in rejections if r.rejection_check))

    return SummaryMetrics(
        total_trades=total_trades,
        wins=len(wins),
        losses=len(losses),
        win_rate=win_rate,
        average_win_r=avg_win_r,
        average_loss_r=avg_loss_r,
        average_r=avg_r,
        total_r=total_r,
        total_pnl_dollars=total_pnl_dollars,
        total_net_pnl_dollars=total_net_pnl_dollars,
        total_fees_dollars=total_fees_dollars,
        total_slippage_dollars=total_slippage_dollars,
        profit_factor=pf,
        max_drawdown_r=max_dd,
        best_trade_r=best,
        worst_trade_r=worst,
        longest_consecutive_loss_streak=streak,
        rejected_signal_count=len(rejections),
        rejection_breakdown=breakdown,
    )
