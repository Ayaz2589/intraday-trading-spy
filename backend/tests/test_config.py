import pytest
from pydantic import ValidationError

from intraday_trade_spy.config import Config, load_config


def _minimal_market_data():
    return {
        "market": {
            "symbol": "SPY",
            "session_start": "09:30:00",
            "session_end": "16:00:00",
            "no_new_trades_after": "15:30:00",
            "force_flat_time": "15:55:00",
        },
        "data": {"csv_path": "x", "output_dir": "y"},
    }


def test_loads_default_config(default_config_path):
    cfg = load_config(default_config_path)
    assert cfg.market.symbol == "SPY"
    assert cfg.app.mode == "backtest"
    assert cfg.broker.live_auto_enabled is False


def test_rejects_non_spy_symbol():
    bad = _minimal_market_data()
    bad["market"]["symbol"] = "QQQ"
    with pytest.raises(ValidationError) as exc:
        Config.model_validate(bad)
    assert "SPY" in str(exc.value)


def test_rejects_live_auto_enabled():
    bad = _minimal_market_data()
    bad["broker"] = {"provider": "paper", "live_auto_enabled": True}
    with pytest.raises(ValidationError):
        Config.model_validate(bad)
