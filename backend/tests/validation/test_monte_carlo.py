"""Feature 015 — Monte Carlo path-risk engine (validation/monte_carlo.py).

Path statistics are locked to hand-computed fixtures (research.md R11) so the
implementation can never drift silently. Units follow backtest/metrics.py:
drawdown percent is a FRACTION of the running peak (0.25 == 25%), and the
equity path is seeded at starting equity.
"""

from __future__ import annotations

import numpy as np
import pytest

from intraday_trade_spy.validation.monte_carlo import (
    equity_path,
    longest_losing_streak,
    longest_underwater,
    max_drawdown_dollars,
    max_drawdown_pct,
)


# ---- T003: path-stat primitives on hand-computed fixtures ------------------

# start=1000, pnls=[+100, -200, -100, +300]
#   path  = [1000, 1100, 900, 800, 1100]
#   peaks = [1000, 1100, 1100, 1100, 1100]
#   drawdowns $ = [0, 0, 200, 300, 0]  -> max $300, max frac 300/1100
FIX_PNLS = [100.0, -200.0, -100.0, 300.0]
FIX_START = 1000.0


def test_equity_path_includes_origin_and_cumsum():
    path = equity_path(FIX_PNLS, starting_equity=FIX_START)
    assert isinstance(path, np.ndarray)
    assert path.tolist() == [1000.0, 1100.0, 900.0, 800.0, 1100.0]


def test_max_drawdown_dollars_hand_computed():
    path = equity_path(FIX_PNLS, starting_equity=FIX_START)
    assert max_drawdown_dollars(path) == pytest.approx(300.0)


def test_max_drawdown_pct_is_peak_relative_fraction():
    path = equity_path(FIX_PNLS, starting_equity=FIX_START)
    assert max_drawdown_pct(path) == pytest.approx(300.0 / 1100.0)


def test_drawdown_with_immediate_loss_measures_from_starting_equity():
    # start=1000, pnls=[-100, +50, -200] -> path [1000, 900, 950, 750]
    # peak stays 1000 -> dd $250, frac 0.25
    path = equity_path([-100.0, 50.0, -200.0], starting_equity=1000.0)
    assert max_drawdown_dollars(path) == pytest.approx(250.0)
    assert max_drawdown_pct(path) == pytest.approx(0.25)


def test_longest_losing_streak_counts_consecutive_losers():
    assert longest_losing_streak(FIX_PNLS) == 2


def test_zero_pnl_breaks_losing_streaks():
    assert longest_losing_streak([-5.0, 0.0, -5.0]) == 1


def test_all_winners_degenerate_gracefully():
    path = equity_path([10.0, 20.0], starting_equity=1000.0)
    assert max_drawdown_dollars(path) == 0.0
    assert max_drawdown_pct(path) == 0.0
    assert longest_losing_streak([10.0, 20.0]) == 0
    assert longest_underwater(path) == 0


def test_all_losers_streak_is_n():
    assert longest_losing_streak([-1.0, -2.0, -3.0]) == 3


def test_longest_underwater_counts_trades_below_prior_peak():
    # path [1000, 1100, 900, 800, 1100]: trades 2 and 3 are below the 1100
    # peak; trade 4 matches it (recovery) -> 2.
    path = equity_path(FIX_PNLS, starting_equity=FIX_START)
    assert longest_underwater(path) == 2


def test_longest_underwater_from_first_trade():
    # path [1000, 900, 950, 750]: every trade below the 1000 start-peak -> 3.
    path = equity_path([-100.0, 50.0, -200.0], starting_equity=1000.0)
    assert longest_underwater(path) == 3


# ---- T005: shuffle simulation (determinism, invariants, distributions) -----


def _mc_cfg(**over):
    from intraday_trade_spy.config import MonteCarloConfig

    base = {"iterations": 64, "seed": 7}
    base.update(over)
    return MonteCarloConfig(**base)


def test_run_monte_carlo_is_deterministic():
    from intraday_trade_spy.validation.monte_carlo import run_monte_carlo

    a = run_monte_carlo(FIX_PNLS, starting_equity=FIX_START, cfg=_mc_cfg(),
                        low_confidence_threshold=30)
    b = run_monte_carlo(FIX_PNLS, starting_equity=FIX_START, cfg=_mc_cfg(),
                        low_confidence_threshold=30)
    assert a == b
    assert a.model_dump() == b.model_dump()


def test_shuffle_distributions_ordered_and_observed_correct():
    from intraday_trade_spy.validation.monte_carlo import run_monte_carlo

    res = run_monte_carlo(FIX_PNLS, starting_equity=FIX_START, cfg=_mc_cfg(),
                          low_confidence_threshold=30)
    s = res.shuffle
    for dist in (s.max_drawdown_pct, s.max_drawdown_dollars,
                 s.longest_losing_streak, s.longest_underwater_trades):
        assert dist.p5 <= dist.p25 <= dist.p50 <= dist.p75 <= dist.p95
    # Observed values = stats of the ACTUAL order (hand-computed above).
    assert s.max_drawdown_dollars.observed == pytest.approx(300.0)
    assert s.max_drawdown_pct.observed == pytest.approx(300.0 / 1100.0)
    assert s.longest_losing_streak.observed == 2
    assert s.longest_underwater_trades.observed == 2


def test_shuffle_drawdown_distribution_is_bounded_by_orderings():
    # For FIX_PNLS the single -200 trade forces dd$ >= 200 in EVERY ordering,
    # and consecutive losses cap it at 300.
    from intraday_trade_spy.validation.monte_carlo import run_monte_carlo

    res = run_monte_carlo(FIX_PNLS, starting_equity=FIX_START, cfg=_mc_cfg(),
                          low_confidence_threshold=30)
    d = res.shuffle.max_drawdown_dollars
    assert 200.0 <= d.p5 and d.p95 <= 300.0 + 1e-9


def test_result_echoes_reproducibility_metadata():
    from intraday_trade_spy.validation.monte_carlo import run_monte_carlo

    res = run_monte_carlo(FIX_PNLS, starting_equity=FIX_START,
                          cfg=_mc_cfg(iterations=64, seed=7),
                          low_confidence_threshold=30)
    assert res.iterations == 64
    assert res.seed == 7
    assert res.trade_count == 4
    assert res.starting_equity == pytest.approx(FIX_START)


def test_low_confidence_flag_uses_threshold():
    from intraday_trade_spy.validation.monte_carlo import run_monte_carlo

    low = run_monte_carlo(FIX_PNLS, starting_equity=FIX_START, cfg=_mc_cfg(),
                          low_confidence_threshold=30)
    ok = run_monte_carlo(FIX_PNLS, starting_equity=FIX_START, cfg=_mc_cfg(),
                         low_confidence_threshold=4)
    assert low.low_confidence is True
    assert ok.low_confidence is False


def test_terminal_equity_guard_raises_on_corrupted_paths():
    from intraday_trade_spy.validation.monte_carlo import _assert_constant_terminal

    good = np.array([[1000.0, 1100.0], [1000.0, 1100.0]])
    _assert_constant_terminal(good)  # no raise
    bad = np.array([[1000.0, 1100.0], [1000.0, 1101.0]])
    with pytest.raises(AssertionError):
        _assert_constant_terminal(bad)


def test_run_monte_carlo_rejects_fewer_than_two_trades():
    from intraday_trade_spy.validation.monte_carlo import run_monte_carlo

    with pytest.raises(ValueError):
        run_monte_carlo([100.0], starting_equity=FIX_START, cfg=_mc_cfg(),
                        low_confidence_threshold=30)
    with pytest.raises(ValueError):
        run_monte_carlo([], starting_equity=FIX_START, cfg=_mc_cfg(),
                        low_confidence_threshold=30)
