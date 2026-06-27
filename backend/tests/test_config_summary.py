"""Feature 025 — unit tests for the pure config-summary derivation.

summarize_config(params) -> ConfigSummary must be deterministic, total
(never raises on missing/empty/unknown params), reuse the KNOB_REGISTRY
labels, and render human-term phrasings. These vectors PIN the exact output.
"""

from intraday_trade_spy.config_summary import (
    ConfigHighlight,
    ConfigSummary,
    summarize_config,
)
from intraday_trade_spy.validation.knobs import KNOB_REGISTRY


def _full_params(
    dist=0.5, buffer=0.2, rr=2.0, orm=15, start=0, end=390
):
    return {
        "strategy": {
            "opening_range": {"minutes": orm},
            "vwap_pullback": {
                "max_distance_from_vwap_pct": dist,
                "stop": {"buffer_pct": buffer},
                "target": {"risk_reward": rr},
                "entry_window": {
                    "start_minutes_after_open": start,
                    "end_minutes_after_open": end,
                },
            },
        }
    }


# -- the canonical one-liner (contract test vector) --------------------------

def test_full_config_one_line_summary_exact():
    s = summarize_config(_full_params())
    assert isinstance(s, ConfigSummary)
    assert s.summary == (
        "VWAP pullback · ≤0.5% from VWAP · 0.2% stop buffer · 2:1 R:R "
        "· 15-min opening range · all-day entry"
    )


def test_second_vector_exact():
    s = summarize_config(_full_params(dist=1.0, buffer=0.05, rr=1.5, orm=30))
    assert s.summary == (
        "VWAP pullback · ≤1% from VWAP · 0.05% stop buffer · 1.5:1 R:R "
        "· 30-min opening range · all-day entry"
    )


# -- determinism --------------------------------------------------------------

def test_deterministic_recompute_identical():
    p = _full_params()
    assert summarize_config(p).summary == summarize_config(p).summary
    assert [(h.label, h.value) for h in summarize_config(p).highlights] == [
        (h.label, h.value) for h in summarize_config(p).highlights
    ]


# -- highlights structure + labels from the registry -------------------------

def test_highlights_ordered_and_labelled_from_registry():
    s = summarize_config(_full_params())
    labels = [h.label for h in s.highlights]
    values = [h.value for h in s.highlights]
    assert labels == [
        KNOB_REGISTRY["strategy.vwap_pullback.max_distance_from_vwap_pct"].label,
        KNOB_REGISTRY["strategy.vwap_pullback.stop.buffer_pct"].label,
        KNOB_REGISTRY["strategy.vwap_pullback.target.risk_reward"].label,
        KNOB_REGISTRY["strategy.opening_range.minutes"].label,
        "entry window",
    ]
    assert values == ["≤0.5%", "0.2%", "2:1 R:R", "15 min", "all-day"]
    assert all(isinstance(h, ConfigHighlight) for h in s.highlights)


# -- entry window rendering ---------------------------------------------------

def test_entry_window_ranged_when_not_full():
    s = summarize_config(_full_params(start=60, end=300))
    assert "entry 60–300 min" in s.summary
    assert "all-day" not in s.summary
    assert s.highlights[-1].value == "60–300 min"


def test_entry_window_all_day_at_registry_bounds():
    # bounds come from the registry, not a literal
    lo = KNOB_REGISTRY[
        "strategy.vwap_pullback.entry_window.start_minutes_after_open"
    ].min
    hi = KNOB_REGISTRY[
        "strategy.vwap_pullback.entry_window.end_minutes_after_open"
    ].max
    s = summarize_config(_full_params(start=int(lo), end=int(hi)))
    assert s.summary.endswith("all-day entry")


# -- number formatting trims trailing zeros ----------------------------------

def test_risk_reward_trims_trailing_zero():
    assert "2:1 R:R" in summarize_config(_full_params(rr=2.0)).summary
    assert "1.5:1 R:R" in summarize_config(_full_params(rr=1.5)).summary


def test_distance_trims_trailing_zero():
    assert "≤1% from VWAP" in summarize_config(_full_params(dist=1.0)).summary


# -- robustness / totality ----------------------------------------------------

def test_empty_params_yields_family_only():
    s = summarize_config({})
    assert s.summary == "VWAP pullback"
    assert s.highlights == []


def test_non_dict_params_never_raises():
    for bad in (None, [], "x", 5):
        s = summarize_config(bad)  # type: ignore[arg-type]
        assert s.summary == "VWAP pullback"
        assert s.highlights == []


def test_missing_individual_knob_is_omitted():
    p = _full_params()
    del p["strategy"]["vwap_pullback"]["stop"]  # drop buffer
    s = summarize_config(p)
    assert "stop buffer" not in s.summary
    assert "≤0.5% from VWAP" in s.summary  # others still present


def test_unknown_key_is_ignored_not_echoed():
    p = _full_params()
    p["strategy"]["vwap_pullback"]["totally_unknown_knob"] = 999
    s = summarize_config(p)
    assert "totally_unknown_knob" not in s.summary
    assert "999" not in s.summary


def test_partial_only_buffer_present():
    p = {"strategy": {"vwap_pullback": {"stop": {"buffer_pct": 0.2}}}}
    s = summarize_config(p)
    assert s.summary == "VWAP pullback · 0.2% stop buffer"
