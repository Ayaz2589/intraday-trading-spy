"""Monte Carlo path-risk engine (Feature 015).

Pure, seeded resampling over a run's chronological per-trade net PnLs — no
engine re-runs, no I/O. Two methods:

- SHUFFLE: permute the exact observed trades -> distributions of the
  path-dependent stats (max drawdown, losing streak, underwater period). The
  trade set is identical in every path, so terminal equity is constant by
  construction (asserted).
- BOOTSTRAP: draw `horizon` PnLs with replacement -> forward equity cone,
  terminal-equity percentiles, and risk-of-ruin probabilities.

Units follow backtest/metrics.py: drawdown percent is a FRACTION of the
running peak; the equity path is seeded at starting equity. All randomness
comes from one `np.random.default_rng(cfg.seed)` so identical inputs+config
yield byte-identical results.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

from intraday_trade_spy.config import MonteCarloConfig
from intraday_trade_spy.models import (
    MonteCarloCone,
    MonteCarloConeStep,
    MonteCarloDistribution,
    MonteCarloResult,
    MonteCarloShuffleStats,
)

_PERCENTILES = (5, 25, 50, 75, 95)


def equity_path(pnls: Sequence[float], *, starting_equity: float) -> np.ndarray:
    """Cumulative equity with the starting equity as the origin point."""
    arr = np.asarray(pnls, dtype=float)
    path = np.empty(arr.size + 1, dtype=float)
    path[0] = starting_equity
    np.cumsum(arr, out=path[1:]) if arr.size else None
    if arr.size:
        path[1:] += starting_equity
    return path


def max_drawdown_dollars(path: np.ndarray) -> float:
    """max(running_peak - equity) over the path."""
    peaks = np.maximum.accumulate(path)
    return float(np.max(peaks - path))


def max_drawdown_pct(path: np.ndarray) -> float:
    """Worst peak-relative drop as a FRACTION (metrics.py convention)."""
    peaks = np.maximum.accumulate(path)
    with np.errstate(divide="ignore", invalid="ignore"):
        fracs = np.where(peaks > 0, (peaks - path) / peaks, 0.0)
    return float(np.max(fracs))


def longest_losing_streak(pnls: Sequence[float]) -> int:
    """Longest run of consecutive trades with pnl < 0 (zero breaks streaks)."""
    best = cur = 0
    for p in pnls:
        cur = cur + 1 if p < 0 else 0
        best = max(best, cur)
    return best


def longest_underwater(path: np.ndarray) -> int:
    """Longest run of consecutive trades strictly below the prior running
    peak (a trade that matches or sets a peak ends the underwater period)."""
    peaks = np.maximum.accumulate(path)
    best = cur = 0
    # Skip the origin point: underwater is a property of trades, not the seed.
    for equity, peak_before in zip(path[1:], peaks[:-1]):
        cur = cur + 1 if equity < peak_before else 0
        best = max(best, cur)
    return best


# ---- vectorized batch helpers (matrix of simulated paths) ------------------


def _longest_true_run_per_row(mask: np.ndarray) -> np.ndarray:
    """Longest consecutive-True run per row, fully vectorized: current run
    length at each cell = cumsum minus the cumsum value at the last False."""
    counts = mask.astype(np.int64)
    cs = np.cumsum(counts, axis=1)
    reset = np.where(~mask, cs, 0)
    running_reset = np.maximum.accumulate(reset, axis=1)
    return (cs - running_reset).max(axis=1) if mask.size else np.zeros(mask.shape[0])


def _paths_from_pnl_matrix(pnl_matrix: np.ndarray, starting_equity: float) -> np.ndarray:
    """(iterations, n) PnL draws -> (iterations, n+1) equity paths with the
    starting-equity origin column."""
    iters = pnl_matrix.shape[0]
    origin = np.full((iters, 1), starting_equity, dtype=float)
    return np.concatenate([origin, starting_equity + np.cumsum(pnl_matrix, axis=1)], axis=1)


def _assert_constant_terminal(paths: np.ndarray) -> None:
    """Shuffle invariant (FR-013): same trade set -> same terminal equity in
    every path. A violation is a programming error, never a user error."""
    terminals = paths[:, -1]
    assert np.allclose(terminals, terminals[0]), (
        "monte carlo shuffle invariant violated: reshuffled paths reached "
        "different terminal equities"
    )


def _distribution(observed: float, samples: np.ndarray) -> MonteCarloDistribution:
    p5, p25, p50, p75, p95 = (float(np.percentile(samples, q)) for q in _PERCENTILES)
    return MonteCarloDistribution(
        observed=float(observed), p5=p5, p25=p25, p50=p50, p75=p75, p95=p95
    )


def run_shuffle(
    pnls: np.ndarray, *, starting_equity: float, cfg: MonteCarloConfig
) -> MonteCarloShuffleStats:
    """Permute the exact observed trades cfg.iterations times and measure the
    path-dependent stats of every ordering."""
    rng = np.random.default_rng(cfg.seed)
    perm = rng.permuted(np.tile(pnls, (cfg.iterations, 1)), axis=1)
    paths = _paths_from_pnl_matrix(perm, starting_equity)
    _assert_constant_terminal(paths)

    peaks = np.maximum.accumulate(paths, axis=1)
    drops = peaks - paths
    dd_dollars = drops.max(axis=1)
    with np.errstate(divide="ignore", invalid="ignore"):
        dd_pct = np.where(peaks > 0, drops / peaks, 0.0).max(axis=1)
    streaks = _longest_true_run_per_row(perm < 0)
    underwater = _longest_true_run_per_row(paths[:, 1:] < peaks[:, :-1])

    observed_path = equity_path(pnls, starting_equity=starting_equity)
    return MonteCarloShuffleStats(
        max_drawdown_pct=_distribution(max_drawdown_pct(observed_path), dd_pct),
        max_drawdown_dollars=_distribution(max_drawdown_dollars(observed_path), dd_dollars),
        longest_losing_streak=_distribution(longest_losing_streak(pnls), streaks),
        longest_underwater_trades=_distribution(longest_underwater(observed_path), underwater),
    )


def _downsample_indices(horizon: int, max_steps: int) -> np.ndarray:
    """Evenly spaced 1-based trade indices, always including 1 and horizon."""
    if horizon <= max_steps:
        return np.arange(1, horizon + 1)
    return np.unique(np.round(np.linspace(1, horizon, max_steps)).astype(int))


def run_bootstrap(
    pnls: np.ndarray, *, starting_equity: float, cfg: MonteCarloConfig
) -> tuple[MonteCarloCone, MonteCarloDistribution, np.ndarray]:
    """Draw `horizon` PnLs with replacement per iteration and walk forward
    from starting equity. Returns (cone, terminal distribution, full equity
    matrix without the origin column — reused by the ruin computation).
    Seeded at cfg.seed + 1 to stay decorrelated from the shuffle method
    (the significance seed+k precedent)."""
    rng = np.random.default_rng(cfg.seed + 1)
    horizon = int(cfg.horizon_trades or pnls.size)
    draws = rng.choice(pnls, size=(cfg.iterations, horizon), replace=True)
    equity = _paths_from_pnl_matrix(draws, starting_equity)[:, 1:]

    idx = _downsample_indices(horizon, cfg.max_cone_steps)
    bands = np.percentile(equity[:, idx - 1], _PERCENTILES, axis=0)
    steps = [
        MonteCarloConeStep(
            trade_index=int(i),
            p5=float(bands[0, k]), p25=float(bands[1, k]), p50=float(bands[2, k]),
            p75=float(bands[3, k]), p95=float(bands[4, k]),
        )
        for k, i in enumerate(idx)
    ]
    terminal = _distribution(
        observed=starting_equity + float(pnls.sum()), samples=equity[:, -1]
    )
    return MonteCarloCone(horizon_trades=horizon, steps=steps), terminal, equity


def run_monte_carlo(
    pnls: Sequence[float],
    *,
    starting_equity: float,
    cfg: MonteCarloConfig,
    low_confidence_threshold: int,
) -> MonteCarloResult:
    """Full Monte Carlo path-risk analysis for one run's trades. Pure +
    seeded: identical inputs and config yield byte-identical results."""
    arr = np.asarray(list(pnls), dtype=float)
    if arr.size < 2:
        raise ValueError(
            f"this run has {arr.size} trade{'s' if arr.size != 1 else ''} — "
            "at least 2 are needed to simulate reorderings"
        )
    cone, terminal, _equity = run_bootstrap(
        arr, starting_equity=starting_equity, cfg=cfg
    )
    return MonteCarloResult(
        shuffle=run_shuffle(arr, starting_equity=starting_equity, cfg=cfg),
        cone=cone,
        terminal_equity=terminal,
        iterations=cfg.iterations,
        seed=cfg.seed,
        trade_count=int(arr.size),
        starting_equity=float(starting_equity),
        low_confidence=bool(arr.size < low_confidence_threshold),
    )
