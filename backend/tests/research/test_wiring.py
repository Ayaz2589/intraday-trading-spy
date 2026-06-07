"""Feature 019 T024 (wiring helpers) — the pure logic inside the default
collaborator factory: applying knob deltas to nested params, and deciding
the auto-backfill range from coverage (research.md R6)."""

from datetime import date

from intraday_trade_spy.research.wiring import apply_changes, stale_range


def test_apply_changes_sets_nested_paths_without_mutating_the_parent():
    parent = {"risk": {"max_risk_per_trade_pct": 0.1},
              "strategy": {"vwap_pullback": {"target": {"risk_reward": 2.0}}}}
    out = apply_changes(parent, [
        {"knob_path": "strategy.vwap_pullback.target.risk_reward", "value": 3.0},
        {"knob_path": "risk.max_consecutive_losses", "value": 4},
    ])
    assert out["strategy"]["vwap_pullback"]["target"]["risk_reward"] == 3.0
    assert out["risk"]["max_consecutive_losses"] == 4
    assert out["risk"]["max_risk_per_trade_pct"] == 0.1          # untouched knobs kept
    assert parent["strategy"]["vwap_pullback"]["target"]["risk_reward"] == 2.0  # no mutation


def test_stale_range_empty_cache_is_the_full_span():
    rng = stale_range(None, full_start="2018-01-01", today=date(2026, 6, 5))
    assert rng == (date(2018, 1, 1), date(2026, 6, 4))  # through yesterday


def test_stale_range_stale_cache_is_incremental():
    # latest cached bar Friday 2026-05-29; today Friday 2026-06-05 → catch up
    rng = stale_range("2026-05-29T19:55:00+00:00",
                      full_start="2018-01-01", today=date(2026, 6, 5))
    assert rng == (date(2026, 5, 29), date(2026, 6, 4))


def test_stale_range_fresh_cache_needs_nothing():
    # latest = the most recent completed weekday session → fresh
    assert stale_range("2026-06-04T19:55:00+00:00",
                       full_start="2018-01-01", today=date(2026, 6, 5)) is None


def test_stale_range_weekend_gap_is_not_stale():
    # Monday: Friday's session is the last completed one
    assert stale_range("2026-06-05T19:55:00+00:00",
                       full_start="2018-01-01", today=date(2026, 6, 8)) is None
