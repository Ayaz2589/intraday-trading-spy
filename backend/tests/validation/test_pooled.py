"""Feature 016 — pooled study gate engine (validation/pooled.py).

Statistics locked to closed-form worked examples from the 2026-06-05 ad-hoc
wf-rr3 gate run (sign test 9/12 -> 0.073242; Fisher X²=85, df=24 -> 9.53e-9)
so the productized gate can never drift from the analysis it replaces.
"""

from __future__ import annotations

import pytest

from intraday_trade_spy.config import MonteCarloConfig, PooledGateConfig
from intraday_trade_spy.validation.pooled import (
    WindowTrades,
    compute_pooled_gate,
    fisher_combined,
    gate_passed,
    pool_windows,
    sign_test_p,
)

# The 12 per-window permutation p-values from the 2026-06-05 ad-hoc run.
WF_RR3_PS = [0.0729, 0.2018, 0.006, 0.1349, 1.0, 0.001, 1.0, 0.001, 0.001,
             0.8422, 0.001, 0.034]


# ---- sign test ---------------------------------------------------------------


def test_sign_test_worked_example_nine_of_twelve():
    # sum(C(12,k) for k in 9..12) / 2^12 = 299/4096 (the ad-hoc run's "0.0730")
    assert sign_test_p(9, 12) == pytest.approx(299 / 4096)
    assert sign_test_p(9, 12) == pytest.approx(0.072998, abs=1e-6)


def test_sign_test_extremes():
    assert sign_test_p(12, 12) == pytest.approx(1 / 4096)
    assert sign_test_p(0, 12) == pytest.approx(1.0)


# ---- Fisher's combined p -----------------------------------------------------


def test_fisher_worked_example_wf_rr3():
    x2, df, p = fisher_combined(WF_RR3_PS)
    assert df == 24
    assert x2 == pytest.approx(85.0, rel=1e-2)
    assert p == pytest.approx(9.53e-9, rel=5e-2)


def test_fisher_p_of_one_contributes_zero():
    x2_with, _, _ = fisher_combined([0.05, 1.0])
    x2_without, _, _ = fisher_combined([0.05])
    assert x2_with == pytest.approx(x2_without)


def test_fisher_single_null_p():
    x2, df, p = fisher_combined([1.0])
    assert x2 == pytest.approx(0.0)
    assert p == pytest.approx(1.0)


# ---- pooling ----------------------------------------------------------------


def test_pool_windows_concatenates_in_window_order():
    pooled = pool_windows([
        WindowTrades(window_index=1, pnls=[3.0], r_multiples=[0.3]),
        WindowTrades(window_index=0, pnls=[1.0, 2.0], r_multiples=[0.1, 0.2]),
    ])
    assert pooled.pnls == [1.0, 2.0, 3.0]
    assert pooled.r_multiples == [0.1, 0.2, 0.3]
    assert pooled.windows_total == 2
    assert pooled.windows_with_trades == 2
    # window positivity from window pnl sums: w0=+3, w1=+3 -> 2 positive
    assert pooled.windows_positive == 2


def test_pool_windows_excludes_but_counts_zero_trade_windows():
    pooled = pool_windows([
        WindowTrades(window_index=0, pnls=[], r_multiples=[]),
        WindowTrades(window_index=1, pnls=[5.0, -1.0], r_multiples=[0.5, -0.1]),
    ])
    assert pooled.pnls == [5.0, -1.0]
    assert pooled.windows_total == 2
    assert pooled.windows_with_trades == 1
    assert pooled.windows_positive == 1


# ---- gate rule ---------------------------------------------------------------


def test_gate_rule_boundary_is_strict():
    assert gate_passed(ci_low=0.0) is False     # exactly zero -> NOT passed
    assert gate_passed(ci_low=1e-9) is True     # strictly above -> passed
    assert gate_passed(ci_low=-0.5) is False


# ---- full result assembly + determinism --------------------------------------


def _windows():
    # Two windows, clearly profitable; enough trades for stable CIs.
    w0 = WindowTrades(
        window_index=0,
        pnls=[10.0, -5.0, 8.0, 12.0, -3.0, 7.0],
        r_multiples=[1.0, -0.5, 0.8, 1.2, -0.3, 0.7],
    )
    w1 = WindowTrades(
        window_index=1,
        pnls=[6.0, -2.0, 9.0, 4.0],
        r_multiples=[0.6, -0.2, 0.9, 0.4],
    )
    return [w0, w1]


def _gate(windows=None):
    return compute_pooled_gate(
        windows or _windows(),
        starting_equity=1000.0,
        cfg=PooledGateConfig(),
        mc_cfg=MonteCarloConfig(iterations=64, seed=7),
        low_confidence_threshold=30,
    )


def test_compute_pooled_gate_assembles_result():
    res = _gate()
    assert res.mode == "fast"
    assert res.pooled_trades == 10
    assert res.windows_total == 2
    assert res.windows_with_trades == 2
    assert res.windows_positive == 2
    assert res.total_net_pnl_dollars == pytest.approx(46.0)
    assert res.expectancy_dollars_ci.point == pytest.approx(4.6)
    assert res.expectancy_dollars_ci.low <= res.expectancy_dollars_ci.point <= res.expectancy_dollars_ci.high
    assert res.expectancy_r_ci.point == pytest.approx(0.46)
    assert res.sign_test_p == pytest.approx(1 / 4)  # 2/2 positive -> 1/2^2
    assert res.monte_carlo.trade_count == 10
    assert res.passed is (res.expectancy_dollars_ci.low > 0)
    assert res.alpha == 0.05
    assert res.seed == PooledGateConfig().seed
    assert res.per_window_p is None and res.fisher is None  # fast mode
    assert res.computed_at is None  # stamped by the lifecycle, not the engine


def test_compute_pooled_gate_is_deterministic():
    a, b = _gate(), _gate()
    assert a == b
    assert a.model_dump() == b.model_dump()


def test_compute_pooled_gate_rejects_fewer_than_two_pooled_trades():
    with pytest.raises(ValueError):
        _gate(windows=[WindowTrades(window_index=0, pnls=[1.0], r_multiples=[0.1])])
