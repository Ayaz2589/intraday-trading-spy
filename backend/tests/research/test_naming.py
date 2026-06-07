"""Feature 019 T014 — deterministic auto-config names (research.md R5)."""

from intraday_trade_spy.research.naming import candidate_name


def test_format_is_auto_seq_cycle_leaf_value():
    changes = [{"knob_path": "strategy.vwap_pullback.target.risk_reward", "value": 2.5}]
    assert candidate_name(seq=7, cycle=3, changes=changes) == "auto07-c3-risk_reward2.5"


def test_values_trim_trailing_zeros():
    changes = [{"knob_path": "strategy.vwap_pullback.target.risk_reward", "value": 2.0}]
    assert candidate_name(seq=1, cycle=1, changes=changes) == "auto01-c1-risk_reward2"


def test_multi_change_candidates_join_sorted_leaf_value_pairs():
    changes = [
        {"knob_path": "strategy.vwap_pullback.target.risk_reward", "value": 3.0},
        {"knob_path": "risk.max_risk_per_trade_pct", "value": 0.2},
    ]
    # sorted by knob path: risk.* before strategy.*
    assert candidate_name(seq=12, cycle=2, changes=changes) == (
        "auto12-c2-max_risk_per_trade_pct0.2-risk_reward3"
    )


def test_two_digit_seq_padding_and_large_seq():
    changes = [{"knob_path": "risk.account_value", "value": 50_000.0}]
    assert candidate_name(seq=3, cycle=10, changes=changes).startswith("auto03-c10-")
    assert candidate_name(seq=104, cycle=1, changes=changes).startswith("auto104-c1-")
