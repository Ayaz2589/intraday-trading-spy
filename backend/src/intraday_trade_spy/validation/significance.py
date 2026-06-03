"""Significance: bootstrap CIs + random-entry permutation verdict (FR-013..016).

Bootstrap = percentile CI via resampling-with-replacement. Permutation p-value =
fraction of the (caller-supplied, random-entry) null distribution at least as
good as the observed metric. All randomness is seeded → identical inputs+seed
yield byte-identical verdicts. The combiner is pure (the null distribution is
computed by the caller via validation.random_entry and injected), so it is
unit-testable without bars or a database.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence

import numpy as np

from intraday_trade_spy.config import SignificanceConfig
from intraday_trade_spy.models import BootstrapCI, SignificanceResult


def _mean(arr: np.ndarray) -> float:
    return float(arr.mean())


def bootstrap_ci(
    values: Sequence[float],
    *,
    statistic: Callable[[np.ndarray], float] = _mean,
    iterations: int,
    confidence: float,
    seed: int,
) -> tuple[float | None, float | None, float | None]:
    """Percentile bootstrap CI. Returns (point, low, high). Degrades to
    (point|None, None, None) when there are fewer than 2 values."""
    arr = np.asarray(values, dtype=float)
    n = arr.size
    if n == 0:
        return None, None, None
    point = statistic(arr)
    if n < 2:
        return point, None, None
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, n, size=(iterations, n))
    samples = np.array([statistic(arr[row]) for row in idx])
    alpha = (1.0 - confidence) / 2.0
    lo = float(np.percentile(samples, 100.0 * alpha))
    hi = float(np.percentile(samples, 100.0 * (1.0 - alpha)))
    return point, lo, hi


def _sharpe_stat(trading_days_per_year: int = 252) -> Callable[[np.ndarray], float]:
    def stat(arr: np.ndarray) -> float:
        if arr.size < 2:
            return 0.0
        sd = arr.std(ddof=1)
        if sd == 0:
            return 0.0
        return float(arr.mean() / sd * math.sqrt(trading_days_per_year))
    return stat


def permutation_p_value(observed: float, null_distribution: Sequence[float]) -> float | None:
    """One-sided p-value: P(null >= observed). None when the null is empty."""
    null = list(null_distribution)
    if not null:
        return None
    at_least = sum(1 for x in null if x >= observed)
    # +1 smoothing (the observed itself is one possible arrangement).
    return (at_least + 1) / (len(null) + 1)


def compute_significance(
    *,
    trade_pnls: Sequence[float],
    trade_rs: Sequence[float],
    daily_returns: Sequence[float],
    observed_metric: float,
    null_distribution: Sequence[float],
    cfg: SignificanceConfig,
    permutation_metric: str = "total_net_pnl_dollars",
) -> SignificanceResult:
    bootstrap = [
        BootstrapCI(statistic="expectancy_dollars", **_unpack(
            bootstrap_ci(trade_pnls, iterations=cfg.bootstrap_iterations,
                         confidence=cfg.confidence, seed=cfg.seed))),
        BootstrapCI(statistic="expectancy_r", **_unpack(
            bootstrap_ci(trade_rs, iterations=cfg.bootstrap_iterations,
                         confidence=cfg.confidence, seed=cfg.seed + 1))),
        BootstrapCI(statistic="sharpe", **_unpack(
            bootstrap_ci(daily_returns, statistic=_sharpe_stat(),
                         iterations=cfg.bootstrap_iterations,
                         confidence=cfg.confidence, seed=cfg.seed + 2))),
    ]
    p = permutation_p_value(observed_metric, null_distribution)
    significant = p is not None and p < cfg.alpha
    return SignificanceResult(
        confidence=cfg.confidence,
        bootstrap=bootstrap,
        permutation_metric=permutation_metric,
        observed=observed_metric,
        p_value=p,
        alpha=cfg.alpha,
        significant=significant,
        bootstrap_iterations=cfg.bootstrap_iterations,
        permutation_iterations=len(null_distribution),
        seed=cfg.seed,
    )


def _unpack(triple):
    """bootstrap_ci returns (point, low, high) → kwargs for BootstrapCI."""
    point, low, high = triple
    return {"point": point, "low": low, "high": high}


def extract_trade_stats(trades: list[dict], *, account_value: float) -> dict:
    """Derive the inputs significance needs from a run's trade rows: per-trade
    net PnL / R, daily returns (for Sharpe), the observed total, the trade
    count, and the median stop distance + quantity (the null's risk profile)."""
    from datetime import date as _date
    from statistics import median

    pnls = [float(t["pnl"]) for t in trades if t.get("pnl") is not None]
    rs = [float(t["r_multiple"]) for t in trades if t.get("r_multiple") is not None]
    observed_total = float(sum(pnls))

    stop_dists, quantities = [], []
    daily: dict[str, float] = {}
    for t in trades:
        try:
            ep, sp = float(t["entry_price"]), float(t["stop_price"])
            if ep > sp:
                stop_dists.append(ep - sp)
        except (KeyError, TypeError, ValueError):
            pass
        if t.get("quantity") is not None:
            quantities.append(float(t["quantity"]))
        if t.get("pnl") is not None and t.get("entry_at"):
            day = str(t["entry_at"])[:10]
            daily[day] = daily.get(day, 0.0) + float(t["pnl"])

    daily_returns = [v / account_value for v in daily.values()] if account_value > 0 else []
    return {
        "trade_pnls": pnls,
        "trade_rs": rs,
        "daily_returns": daily_returns,
        "observed_total": observed_total,
        "n_trades": len(trades),
        "stop_distance": median(stop_dists) if stop_dists else 0.0,
        "quantity": median(quantities) if quantities else 0.0,
    }
