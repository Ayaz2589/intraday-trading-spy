"""Feature 019 T013 — the tightened gate bar (research.md R4).

Bonferroni on the pooled-gate CI level: level(k) = 1 - base_alpha/k, where k
is the knob family's recorded trial count. Monotone non-loosening (SC-006);
family keys derive from the candidate's changes vs the starting config.
"""

from statistics import NormalDist

import pytest

from intraday_trade_spy.research.bar_schedule import bar_level, family_key, k_for

BASE = 0.05


def test_level_is_one_minus_alpha_over_k():
    assert bar_level(1, base_alpha=BASE) == pytest.approx(0.95)
    assert bar_level(2, base_alpha=BASE) == pytest.approx(0.975)
    assert bar_level(5, base_alpha=BASE) == pytest.approx(0.99)


def test_level_is_monotone_non_loosening_in_k():
    levels = [bar_level(k, base_alpha=BASE) for k in range(1, 30)]
    assert levels == sorted(levels)
    assert all(lv < 1.0 for lv in levels)


def test_level_rejects_invalid_k():
    with pytest.raises(ValueError):
        bar_level(0, base_alpha=BASE)


def test_family_key_sorts_and_joins_knob_paths():
    changes = [
        {"knob_path": "strategy.vwap_pullback.target.risk_reward", "value": 2.5},
        {"knob_path": "risk.max_risk_per_trade_pct", "value": 0.2},
    ]
    assert family_key(changes) == (
        "risk.max_risk_per_trade_pct,strategy.vwap_pullback.target.risk_reward"
    )
    # the starting config (no changes) has the empty family
    assert family_key([]) == ""


class _CountingStorage:
    def __init__(self, count):
        self._count = count
        self.calls = []

    def count_family_trials(self, *, strategy_id, family):
        self.calls.append((strategy_id, family))
        return self._count


def test_k_is_one_plus_recorded_family_trials():
    storage = _CountingStorage(3)
    assert k_for(storage, strategy_id="s-1", family="a.b") == 4
    assert storage.calls == [("s-1", "a.b")]


def test_k_for_the_starting_config_is_one_without_counting():
    storage = _CountingStorage(99)
    assert k_for(storage, strategy_id="s-1", family="") == 1
    assert storage.calls == []  # the empty family never queries the ledger


def test_sc006_worked_example_pass_at_k1_fails_at_k5():
    """SC-006: the identical statistic clears the k=1 bar and fails the k=5
    bar — volume cannot wear the gate down. Normal-approx CI of a pooled
    expectancy with mean 1.0, se 0.45."""
    mean, se = 1.0, 0.45

    def ci_low(level):
        z = NormalDist().inv_cdf(0.5 + level / 2)
        return mean - z * se

    assert ci_low(bar_level(1, base_alpha=BASE)) > 0      # 95% CI low ≈ +0.118 → pass
    assert ci_low(bar_level(5, base_alpha=BASE)) <= 0     # 99% CI low ≈ −0.159 → fail
