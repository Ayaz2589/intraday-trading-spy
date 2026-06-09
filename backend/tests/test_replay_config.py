"""Feature 022 (T003) — ReplayConfig parsing + defaults."""

import pytest

from intraday_trade_spy.config import ReplayConfig, load_config


def test_default_speeds_and_default_speed():
    c = ReplayConfig()
    assert c.speeds == [1, 10, 30, 60, 300, 600, 1800, 3600]
    assert c.default_speed == 60


def test_default_speed_must_be_in_speeds():
    with pytest.raises(ValueError):
        ReplayConfig(speeds=[1, 10], default_speed=60)


def test_loaded_config_exposes_replay(default_config_path):
    cfg = load_config(default_config_path)
    assert cfg.replay.default_speed in cfg.replay.speeds
    assert 3600 in cfg.replay.speeds


def test_config_omitting_replay_falls_back_to_defaults(default_config_path):
    import yaml

    raw = yaml.safe_load(default_config_path.read_text())
    raw.pop("replay", None)
    from intraday_trade_spy.config import Config

    cfg = Config.model_validate(raw)
    assert cfg.replay.default_speed == 60
