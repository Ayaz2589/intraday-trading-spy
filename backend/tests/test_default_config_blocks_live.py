"""T059 (Phase 5 / US3): default config has live_auto disabled and
attempts to enable it fail at validation."""
import pytest
from pydantic import ValidationError

from intraday_trade_spy.config import Config, load_config


def test_default_config_has_live_disabled(default_config_path):
    cfg = load_config(default_config_path)
    assert cfg.broker.live_auto_enabled is False


def test_attempt_to_enable_live_fails_validation():
    with pytest.raises(ValidationError):
        Config.model_validate(
            {
                "market": {
                    "symbol": "SPY",
                    "session_start": "09:30:00",
                    "session_end": "16:00:00",
                    "no_new_trades_after": "15:30:00",
                    "force_flat_time": "15:55:00",
                },
                "data": {"csv_path": "x", "output_dir": "y"},
                "broker": {"provider": "paper", "live_auto_enabled": True},
            }
        )
