"""Pooled study gate engine (Feature 016).

Pure, seeded statistics over a walk-forward study's out-of-sample windows —
the productized version of the 2026-06-05 ad-hoc wf-rr3 lockbox-gate run.
No I/O: the lifecycle layer gathers windows and persists results.

Gate rule (pre-registered): passed iff the pooled expectancy-$ bootstrap CI
lower bound (at 1 - alpha) is STRICTLY greater than zero.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

from pydantic import BaseModel, ConfigDict

from intraday_trade_spy.config import MonteCarloConfig, PooledGateConfig
from intraday_trade_spy.models import CIStat, PooledGateResult
from intraday_trade_spy.validation.monte_carlo import run_monte_carlo
from intraday_trade_spy.validation.significance import bootstrap_ci


class WindowTrades(BaseModel):
    """One validation window's trades, chronological within the window."""

    model_config = ConfigDict(frozen=True)
    window_index: int
    pnls: list[float]
    r_multiples: list[float]


class PooledWindows(BaseModel):
    """Window-ordered concatenation + the disclosure counts."""

    model_config = ConfigDict(frozen=True)
    pnls: list[float]
    r_multiples: list[float]
    windows_total: int
    windows_with_trades: int
    windows_positive: int


def sign_test_p(positive: int, total: int) -> float:
    """One-sided binomial tail: P(X >= positive | p=0.5, n=total)."""
    if total <= 0:
        return 1.0
    return sum(math.comb(total, k) for k in range(positive, total + 1)) / 2**total


def fisher_combined(p_values: Sequence[float]) -> tuple[float, int, float]:
    """Fisher's method over independent one-sided p-values.
    Returns (X², df, combined p). Survival of chi²(2k) via the integer-df
    series e^{-x/2} · Σ_{n<k} (x/2)^n / n! — no scipy dependency."""
    x2 = -2.0 * sum(math.log(p) for p in p_values)
    df = 2 * len(p_values)
    k = df // 2
    half = x2 / 2.0
    p = math.exp(-half) * sum(half**n / math.factorial(n) for n in range(k))
    return x2, df, min(max(p, 0.0), 1.0)


def gate_passed(*, ci_low: float) -> bool:
    """The pre-registered rule — strictly greater than zero."""
    return ci_low > 0.0


def pool_windows(windows: Sequence[WindowTrades]) -> PooledWindows:
    """Concatenate trades in window order; zero-trade windows are excluded
    from the pool but counted for disclosure ("11 of 12 contributed")."""
    ordered = sorted(windows, key=lambda w: w.window_index)
    pnls: list[float] = []
    rs: list[float] = []
    with_trades = 0
    positive = 0
    for w in ordered:
        if not w.pnls:
            continue
        with_trades += 1
        if sum(w.pnls) > 0:
            positive += 1
        pnls.extend(w.pnls)
        rs.extend(w.r_multiples)
    return PooledWindows(
        pnls=pnls,
        r_multiples=rs,
        windows_total=len(ordered),
        windows_with_trades=with_trades,
        windows_positive=positive,
    )


def compute_pooled_gate(
    windows: Sequence[WindowTrades],
    *,
    starting_equity: float,
    cfg: PooledGateConfig,
    mc_cfg: MonteCarloConfig,
    low_confidence_threshold: int,
) -> PooledGateResult:
    """Fast-mode gate: pooled bootstrap CIs ($ and R), pooled Monte Carlo,
    sign test, verdict. Fully seeded -> byte-identical recompute. The
    lifecycle stamps computed_at and (in full mode) appends per-window
    p-values + Fisher via model_copy."""
    pooled = pool_windows(windows)
    if len(pooled.pnls) < 2:
        raise ValueError(
            f"this study pools {len(pooled.pnls)} trade"
            f"{'s' if len(pooled.pnls) != 1 else ''} across its validation "
            "windows — at least 2 are needed for the gate"
        )

    confidence = 1.0 - cfg.alpha
    d_point, d_low, d_high = bootstrap_ci(
        pooled.pnls, iterations=1000, confidence=confidence, seed=cfg.seed
    )
    r_point, r_low, r_high = bootstrap_ci(
        pooled.r_multiples, iterations=1000, confidence=confidence, seed=cfg.seed + 1
    )
    mc = run_monte_carlo(
        pooled.pnls,
        starting_equity=starting_equity,
        cfg=mc_cfg,
        low_confidence_threshold=low_confidence_threshold,
    )
    return PooledGateResult(
        computed_at=None,
        mode="fast",
        passed=gate_passed(ci_low=d_low if d_low is not None else float("-inf")),
        alpha=cfg.alpha,
        pooled_trades=len(pooled.pnls),
        windows_total=pooled.windows_total,
        windows_with_trades=pooled.windows_with_trades,
        windows_positive=pooled.windows_positive,
        total_net_pnl_dollars=float(sum(pooled.pnls)),
        expectancy_dollars_ci=CIStat(point=d_point, low=d_low, high=d_high),
        expectancy_r_ci=CIStat(point=r_point, low=r_low, high=r_high),
        sign_test_p=sign_test_p(pooled.windows_positive, pooled.windows_with_trades),
        monte_carlo=mc,
        per_window_p=None,
        fisher=None,
        seed=cfg.seed,
    )
