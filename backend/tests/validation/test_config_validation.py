"""T007 — ValidationConfig parsing (Feature 011, Phase 2).

The validation block governs split dates, walk-forward windowing, sensitivity,
and significance. Per the MetricsConfig precedent, the Pydantic models carry
defaults mirroring config.yaml (no magic numbers leak into the *logic* — the
authoritative values live in config.yaml and override these defaults).
"""

from datetime import date
from pathlib import Path

from intraday_trade_spy.config import (
    SignificanceConfig,
    SplitConfig,
    ValidationConfig,
    WalkForwardConfig,
    build_effective_config,
    load_config,
)

CONFIG_YAML = Path(__file__).resolve().parents[2] / "config" / "config.yaml"


def test_validation_config_defaults():
    cfg = ValidationConfig()
    # Lockbox is the most-recent slice (held out).
    assert cfg.split.lockbox.start == date(2025, 1, 1)
    assert cfg.split.train.start == date(2018, 1, 1)
    assert cfg.split.validation.end == date(2024, 12, 31)
    # Clarified walk-forward default: rolling 12mo train / 6mo step / 6mo OOS.
    assert cfg.walk_forward.mode == "rolling"
    assert cfg.walk_forward.train_months == 12
    assert cfg.walk_forward.step_months == 6
    assert cfg.walk_forward.validation_months == 6
    # Significance defaults (seeded for reproducibility).
    assert cfg.significance.bootstrap_iterations == 1000
    assert cfg.significance.permutation_iterations == 1000
    assert cfg.significance.confidence == 0.95
    assert cfg.significance.alpha == 0.05
    assert isinstance(cfg.significance.seed, int)
    # D1 resolved: a single canonical fan-out guard.
    assert cfg.max_evaluations_warn == 200
    assert cfg.sensitivity.default_metric == "expectancy_dollars"


def test_validation_config_overrides():
    cfg = ValidationConfig.model_validate(
        {
            "split": {
                "train": {"start": "2019-01-01", "end": "2021-12-31"},
                "validation": {"start": "2022-01-01", "end": "2023-12-31"},
                "lockbox": {"start": "2024-01-01", "end": "2024-12-31"},
            },
            "walk_forward": {"mode": "anchored", "train_months": 24, "step_months": 12},
            "significance": {"seed": 42, "alpha": 0.01},
        }
    )
    assert cfg.split.train.end == date(2021, 12, 31)
    assert cfg.walk_forward.mode == "anchored"
    assert cfg.walk_forward.train_months == 24
    assert cfg.walk_forward.step_months == 12
    # Unset sub-fields fall back to defaults.
    assert cfg.walk_forward.validation_months == 6
    assert cfg.significance.seed == 42
    assert cfg.significance.alpha == 0.01


def test_config_yaml_has_validation_block():
    cfg = load_config(CONFIG_YAML)
    assert cfg.validation is not None
    assert cfg.validation.split.lockbox.start == date(2025, 1, 1)
    assert cfg.validation.walk_forward.mode == "rolling"
    assert cfg.validation.significance.alpha == 0.05


def test_build_effective_config_preserves_validation():
    # A user knob override (strategy) must not wipe the validation block.
    cfg = build_effective_config(
        {"strategy": {"vwap_pullback": {"target": {"risk_reward": 3.0}}}},
        base_path=CONFIG_YAML,
    )
    assert cfg.strategy.vwap_pullback.target.risk_reward == 3.0
    assert cfg.validation.split.lockbox.end == date(2026, 12, 31)
    assert isinstance(cfg.validation, ValidationConfig)


def test_submodels_are_importable():
    # Stable public surface used by split.py / walk_forward.py / significance.py.
    assert SplitConfig and WalkForwardConfig and SignificanceConfig


# ---- Feature 015 (Monte Carlo path-risk) -----------------------------------


def test_monte_carlo_config_defaults():
    cfg = ValidationConfig()
    mc = cfg.monte_carlo
    assert mc.iterations == 2000
    assert mc.seed == 20260604
    assert mc.ruin_thresholds_pct == [5, 10, 20]
    assert mc.horizon_trades is None  # None -> match observed trade count
    assert mc.max_cone_steps == 200


def test_monte_carlo_yaml_block_round_trip():
    cfg = load_config(CONFIG_YAML)
    mc = cfg.validation.monte_carlo
    assert mc.iterations == 2000
    assert mc.seed == 20260604
    assert [float(t) for t in mc.ruin_thresholds_pct] == [5.0, 10.0, 20.0]
    assert mc.horizon_trades is None
    assert mc.max_cone_steps == 200


def test_monte_carlo_config_overrides():
    cfg = ValidationConfig.model_validate(
        {"monte_carlo": {"iterations": 500, "horizon_trades": 100}}
    )
    assert cfg.monte_carlo.iterations == 500
    assert cfg.monte_carlo.horizon_trades == 100
    assert cfg.monte_carlo.seed == 20260604  # other defaults untouched
