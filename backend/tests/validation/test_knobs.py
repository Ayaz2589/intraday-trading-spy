"""Feature 017 — the knob registry + adversarial sanitation (TDD).

THE single source of truth for what Claude may suggest and what a draft may
prefill. sanitize_changes never trusts model output: off-registry paths and
out-of-bounds values die here, BEFORE storage (FR-002/SC-002)."""

from __future__ import annotations

import pytest

from intraday_trade_spy.validation.knobs import (
    KNOB_REGISTRY,
    registry_prompt_section,
    sanitize_changes,
)

RR = "strategy.vwap_pullback.target.risk_reward"
DIST = "strategy.vwap_pullback.max_distance_from_vwap_pct"
MINUTES = "strategy.opening_range.minutes"
LOSSES = "risk.max_consecutive_losses"

EXPECTED_BOUNDS = {
    "risk.account_value": (100, 10_000_000),
    "risk.max_risk_per_trade_pct": (0.01, 10),
    "risk.max_position_value_pct": (1, 1000),
    LOSSES: (1, 10),
    MINUTES: (5, 60),
    RR: (0.5, 10),
    "strategy.vwap_pullback.stop.buffer_pct": (0.0, 1.0),
    DIST: (0.01, 2.0),
    # Feature 020: the entry window joins the searchable whitelist.
    "strategy.vwap_pullback.entry_window.start_minutes_after_open": (0, 390),
    "strategy.vwap_pullback.entry_window.end_minutes_after_open": (0, 390),
}


def test_registry_contains_exactly_the_seeded_knobs_with_bounds():
    assert set(KNOB_REGISTRY) == set(EXPECTED_BOUNDS)
    for path, (lo, hi) in EXPECTED_BOUNDS.items():
        spec = KNOB_REGISTRY[path]
        assert spec.min == lo and spec.max == hi
        assert spec.kind in ("float", "int")
        assert spec.label
    assert KNOB_REGISTRY[MINUTES].kind == "int"
    assert KNOB_REGISTRY[LOSSES].kind == "int"
    assert KNOB_REGISTRY[RR].kind == "float"


def test_sanitize_keeps_valid_changes():
    out = sanitize_changes([{"knob_path": RR, "value": 2.5}])
    assert len(out) == 1
    assert out[0].knob_path == RR and out[0].value == 2.5


def test_sanitize_drops_off_registry_paths():
    assert sanitize_changes([{"knob_path": "broker.fees_per_share", "value": 0.0}]) == []
    assert sanitize_changes([{"knob_path": "made.up.path", "value": 1}]) == []


def test_sanitize_drops_out_of_bounds_values():
    assert sanitize_changes([{"knob_path": RR, "value": 9000}]) == []      # hallucination dies
    assert sanitize_changes([{"knob_path": RR, "value": 0.1}]) == []       # below min
    assert sanitize_changes([{"knob_path": DIST, "value": -0.5}]) == []


def test_sanitize_coerces_int_kind_via_round_then_bounds_checks():
    out = sanitize_changes([{"knob_path": MINUTES, "value": 15.7}])
    assert len(out) == 1 and out[0].value == 16  # round() then bounds (analyze A1)
    # rounds INTO bounds at the edge
    assert sanitize_changes([{"knob_path": MINUTES, "value": 60.4}])[0].value == 60
    # rounds OUT of bounds -> dropped
    assert sanitize_changes([{"knob_path": MINUTES, "value": 60.6}]) == []


def test_sanitize_keeps_only_the_valid_subset_of_a_mixed_list():
    out = sanitize_changes([
        {"knob_path": RR, "value": 2.5},                       # valid
        {"knob_path": "made.up", "value": 1},                  # off-list
        {"knob_path": DIST, "value": 99},                      # out of bounds
        {"knob_path": MINUTES, "value": 30},                   # valid
    ])
    assert [(c.knob_path, c.value) for c in out] == [(RR, 2.5), (MINUTES, 30)]


@pytest.mark.parametrize("garbage", [
    None,
    [],
    [None],
    ["not a dict"],
    [{"no_keys": True}],
    [{"knob_path": RR}],                       # missing value
    [{"knob_path": RR, "value": "two"}],       # non-numeric value
    [{"knob_path": RR, "value": float("nan")}],
    [{"knob_path": 42, "value": 2.0}],         # non-string path
])
def test_sanitize_never_raises_on_malformed_input(garbage):
    assert sanitize_changes(garbage) == []


def test_registry_prompt_section_mentions_every_path_and_bounds():
    section = registry_prompt_section()
    for path, (lo, hi) in EXPECTED_BOUNDS.items():
        assert path in section
        assert str(lo) in section and str(hi) in section


# ---- Feature 020: entry-window knobs join the registry --------------------------


def test_entry_window_knobs_are_registered_with_bounds():
    from intraday_trade_spy.validation.knobs import KNOB_REGISTRY

    start = KNOB_REGISTRY["strategy.vwap_pullback.entry_window.start_minutes_after_open"]
    end = KNOB_REGISTRY["strategy.vwap_pullback.entry_window.end_minutes_after_open"]
    assert (start.min, start.max, start.kind) == (0, 390, "int")
    assert (end.min, end.max, end.kind) == (0, 390, "int")
    assert start.label == "entry window start (min after open)"
    assert end.label == "entry window end (min after open)"


def test_entry_window_changes_sanitize_like_any_knob():
    from intraday_trade_spy.validation.knobs import sanitize_changes

    kept = sanitize_changes([
        {"knob_path": "strategy.vwap_pullback.entry_window.start_minutes_after_open", "value": 30},
        {"knob_path": "strategy.vwap_pullback.entry_window.end_minutes_after_open", "value": 270},
        {"knob_path": "strategy.vwap_pullback.entry_window.start_minutes_after_open", "value": 500},
        {"knob_path": "strategy.vwap_pullback.entry_window.end_minutes_after_open", "value": -5},
    ])
    assert [(c.knob_path.rsplit(".", 1)[-1], c.value) for c in kept] == [
        ("start_minutes_after_open", 30.0),
        ("end_minutes_after_open", 270.0),
    ]


def test_entry_window_knobs_appear_in_the_prompt_section():
    from intraday_trade_spy.validation.knobs import registry_prompt_section

    text = registry_prompt_section()
    assert "entry_window.start_minutes_after_open" in text
    assert "entry_window.end_minutes_after_open" in text


def test_registry_leaves_remain_unique():
    """The CLI resolves knobs by unique leaf (019 contract) — adding knobs
    must never create a leaf collision."""
    from intraday_trade_spy.validation.knobs import KNOB_REGISTRY

    leaves = [p.rsplit(".", 1)[-1] for p in KNOB_REGISTRY]
    assert len(leaves) == len(set(leaves))
