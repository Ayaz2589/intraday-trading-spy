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


# ---------- Feature 010: honest-backtest config ----------


def test_broker_cost_defaults_are_net_of_cost():
    """T003/SC-007: shipped defaults make backtests net-of-cost out of the box —
    commission-free fees but a non-zero per-share slippage."""
    from intraday_trade_spy.config import BrokerConfig

    bc = BrokerConfig()
    assert bc.fees_per_share == 0.0
    assert bc.slippage_per_share == 0.01


def test_metrics_config_defaults():
    """T003: MetricsConfig carries the documented defaults (no magic numbers
    in source)."""
    cfg = Config.model_validate(_minimal_market_data())
    assert cfg.metrics.trading_days_per_year == 252
    assert cfg.metrics.risk_free_rate == 0.0
    assert cfg.metrics.win_rate_ci_confidence == 0.95
    assert cfg.metrics.low_confidence_trade_count == 30


def test_default_config_yaml_loads_metrics_block(default_config_path):
    """T003: the shipped config.yaml metrics block parses."""
    cfg = load_config(default_config_path)
    assert cfg.metrics.trading_days_per_year == 252
    assert cfg.broker.slippage_per_share == 0.01
