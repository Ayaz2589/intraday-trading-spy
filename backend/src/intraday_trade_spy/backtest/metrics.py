import math
import statistics
from collections import Counter
from zoneinfo import ZoneInfo

from intraday_trade_spy.config import MetricsConfig
from intraday_trade_spy.models import (
    Bucket,
    EquityPoint,
    JournalEntry,
    SignalStatus,
    SummaryMetrics,
)

ET = ZoneInfo("America/New_York")

_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _skew(series: list[float]) -> float | None:
    """Fisher-Pearson adjusted skewness. None when undefined (n<3 or zero
    variance)."""
    n = len(series)
    if n < 3:
        return None
    mean = sum(series) / n
    m2 = sum((x - mean) ** 2 for x in series) / n
    if m2 == 0:
        return None
    m3 = sum((x - mean) ** 3 for x in series) / n
    g1 = m3 / (m2 ** 1.5)
    return g1 * math.sqrt(n * (n - 1)) / (n - 2)


def _wilson_ci(
    wins: int, n: int, confidence: float
) -> tuple[float | None, float | None]:
    """Wilson score interval on the win proportion. Well-behaved at small n and
    near 0/1 (where the normal approximation breaks). None when n == 0."""
    if n <= 0:
        return None, None
    z = statistics.NormalDist().inv_cdf((1 + confidence) / 2)
    p = wins / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    margin = (z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / denom
    return max(0.0, center - margin), min(1.0, center + margin)


def _sharpe_sortino(
    completed: list[JournalEntry], account_value: float, cfg: MetricsConfig
) -> tuple[float | None, float | None]:
    """Daily-return Sharpe and Sortino: aggregate net PnL per ET trading day as
    a return on account equity; rf from config; annualized by √trading_days."""
    if account_value <= 0:
        return None, None
    daily: dict[str, float] = {}
    for r in completed:
        if r.realized_pnl is None:
            continue
        day = r.timestamp.astimezone(ET).date().isoformat()
        daily[day] = daily.get(day, 0.0) + r.realized_pnl
    returns = [pnl / account_value for pnl in daily.values()]
    if len(returns) < 2:
        return None, None
    excess = [r - cfg.risk_free_rate for r in returns]
    mean = statistics.mean(excess)
    ann = math.sqrt(cfg.trading_days_per_year)
    sd = statistics.stdev(excess)
    sharpe = (mean / sd * ann) if sd > 0 else None
    downside = math.sqrt(sum(min(r, 0.0) ** 2 for r in excess) / len(excess))
    sortino = (mean / downside * ann) if downside > 0 else None
    return sharpe, sortino


def _bucketize(trades, label_fn, sort_fn) -> list[Bucket]:
    """trades: list of (entry_row, exit_row). Bucketed by NY-local entry time."""
    groups: dict[str, list[JournalEntry]] = {}
    for entry_row, exit_row in trades:
        key = label_fn(entry_row.timestamp.astimezone(ET))
        groups.setdefault(key, []).append(exit_row)
    out: list[Bucket] = []
    for key in sorted(groups, key=sort_fn):
        exits = groups[key]
        net = sum(e.realized_pnl for e in exits if e.realized_pnl is not None)
        decisive = [e for e in exits if e.exit_reason in ("target", "stop")]
        wins = sum(1 for e in decisive if e.exit_reason == "target")
        win_rate = (wins / len(decisive)) if decisive else None
        rs = [e.realized_r for e in exits if e.realized_r is not None]
        expectancy_r = (sum(rs) / len(rs)) if rs else None
        out.append(
            Bucket(
                key=key,
                trade_count=len(exits),
                net_pnl_dollars=net,
                win_rate=win_rate,
                expectancy_r=expectancy_r,
            )
        )
    return out


def compute_summary(
    rows: list[JournalEntry],
    *,
    account_value: float = 25000.0,
    metrics_config: MetricsConfig | None = None,
) -> SummaryMetrics:
    cfg = metrics_config or MetricsConfig()

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

    # Max drawdown in R (retained for continuity).
    cum = peak = max_dd = 0.0
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

    # ---- Feature 010: net-$ metrics ----
    completed_sorted = sorted(completed, key=lambda r: r.timestamp)
    net_series = [r.realized_pnl for r in completed_sorted if r.realized_pnl is not None]

    # Expectancy
    loss_rate = (len(losses) / total_trades) if total_trades else 0.0
    expectancy_r = (
        win_rate * avg_win_r - loss_rate * abs(avg_loss_r) if total_trades else None
    )
    expectancy_dollars = (
        total_net_pnl_dollars / total_trades if total_trades else None
    )

    # Equity curve (seed at account_value) + drawdown $/%
    equity_curve = [EquityPoint(timestamp=None, equity=account_value, cumulative_net_pnl=0.0)]
    cum_pnl = 0.0
    for r in completed_sorted:
        if r.realized_pnl is None:
            continue
        cum_pnl += r.realized_pnl
        equity_curve.append(
            EquityPoint(
                timestamp=r.timestamp,
                equity=account_value + cum_pnl,
                cumulative_net_pnl=cum_pnl,
            )
        )
    max_drawdown_dollars = 0.0
    max_drawdown_pct: float | None = None
    if net_series:
        running_peak = equity_curve[0].equity
        worst_pct = 0.0
        for pt in equity_curve:
            running_peak = max(running_peak, pt.equity)
            drop = running_peak - pt.equity
            max_drawdown_dollars = max(max_drawdown_dollars, drop)
            if running_peak > 0:
                worst_pct = max(worst_pct, drop / running_peak)
        max_drawdown_pct = worst_pct

    # Distribution
    return_median_dollars = statistics.median(net_series) if net_series else None
    return_std_dollars = statistics.stdev(net_series) if len(net_series) >= 2 else None
    return_skew = _skew(net_series)

    # Sharpe / Sortino
    sharpe, sortino = _sharpe_sortino(completed, account_value, cfg)

    # Significance (US3): Wilson CI on the win proportion + low-sample flag.
    win_rate_ci_low, win_rate_ci_high = _wilson_ci(
        len(wins), total_trades, cfg.win_rate_ci_confidence
    )
    low_confidence = total_trades < cfg.low_confidence_trade_count

    # Per-bucket breakdown by NY-local entry time (one position at a time → exact
    # chronological pairing of executed↔exit rows).
    trades = list(
        zip(
            sorted(executed, key=lambda r: r.timestamp),
            completed_sorted,
        )
    )
    hour_buckets = _bucketize(trades, lambda d: str(d.hour), lambda k: int(k))
    weekday_buckets = _bucketize(
        trades, lambda d: _WEEKDAYS[d.weekday()], lambda k: _WEEKDAYS.index(k)
    )
    month_buckets = _bucketize(trades, lambda d: str(d.month), lambda k: int(k))

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
        expectancy_r=expectancy_r,
        expectancy_dollars=expectancy_dollars,
        sharpe=sharpe,
        sortino=sortino,
        max_drawdown_dollars=max_drawdown_dollars,
        max_drawdown_pct=max_drawdown_pct,
        return_median_dollars=return_median_dollars,
        return_std_dollars=return_std_dollars,
        return_skew=return_skew,
        win_rate_ci_low=win_rate_ci_low,
        win_rate_ci_high=win_rate_ci_high,
        low_confidence=low_confidence,
        equity_curve=equity_curve,
        hour_buckets=hour_buckets,
        weekday_buckets=weekday_buckets,
        month_buckets=month_buckets,
    )
