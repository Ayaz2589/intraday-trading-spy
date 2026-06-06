"""Feature 018 T004: the health/recommend thresholds live in config.yaml and
are exposed typed by the loader (FR-003 — no hardcoded magic numbers; the
engine reads these, never literals)."""

from pathlib import Path

import pytest

from intraday_trade_spy.config import InsightsConfig, load_config

CONFIG_PATH = Path(__file__).parents[2] / "config" / "config.yaml"


def test_health_thresholds_exposed_from_yaml():
    cfg = load_config(CONFIG_PATH)
    th = cfg.insights.health
    assert th.min_windows == 6
    assert th.recent_windows == 4
    assert th.degradation_margin_r == pytest.approx(0.02)


def test_recommend_thresholds_exposed_from_yaml():
    cfg = load_config(CONFIG_PATH)
    rc = cfg.insights.recommend
    assert rc.min_improvement_r == pytest.approx(0.01)
    assert rc.min_shared_windows == 4
    assert rc.max_candidates == 5


def test_model_defaults_mirror_yaml():
    """A stale/missing yaml section must not silently zero the thresholds —
    the model defaults mirror the published values."""
    ic = InsightsConfig()
    assert ic.health.min_windows == 6
    assert ic.health.recent_windows == 4
    assert ic.health.degradation_margin_r == pytest.approx(0.02)
    assert ic.recommend.min_improvement_r == pytest.approx(0.01)
    assert ic.recommend.min_shared_windows == 4
    assert ic.recommend.max_candidates == 5
