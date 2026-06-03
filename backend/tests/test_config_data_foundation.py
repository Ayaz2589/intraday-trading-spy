"""Feature 009 — config model coverage for the data-foundation knobs.

TDD (constitution IV): these assert the new DataConfig/AlpacaConfig fields
parse from the shipped config.yaml and have sane defaults.
"""

from __future__ import annotations

from datetime import date

import pytest

from intraday_trade_spy.config import (
    AlpacaConfig,
    Config,
    DataConfig,
    RegimeWindow,
    load_config,
)


def test_shipped_config_parses_data_foundation_fields():
    cfg = load_config("config/config.yaml")
    assert cfg.data.source_preference == ["alpaca", "yfinance"]
    assert cfg.data.regime_covered_threshold_pct == 90
    # Shipped config uses the SIP (consolidated) feed after the Algo Trader Plus
    # subscription; the model default remains "iex" (see test below).
    assert cfg.alpaca.feed == "sip"


def test_shipped_config_parses_regimes():
    cfg = load_config("config/config.yaml")
    names = [r.name for r in cfg.data.regimes]
    assert names == [
        "2020 volatility",
        "2021 bull",
        "2022 bear",
        "2023-24 chop/trend",
    ]
    first = cfg.data.regimes[0]
    assert isinstance(first.start, date) and isinstance(first.end, date)
    assert first.start == date(2020, 1, 1)
    assert first.end == date(2020, 12, 31)


def test_regime_window_model():
    rw = RegimeWindow(name="x", start="2022-01-01", end="2022-12-31")
    assert rw.start == date(2022, 1, 1)
    assert rw.end == date(2022, 12, 31)


def test_alpaca_config_defaults_to_iex():
    assert AlpacaConfig().feed == "iex"


def test_alpaca_config_rejects_unknown_feed():
    with pytest.raises(Exception):
        AlpacaConfig(feed="bogus")


def test_dataconfig_source_preference_defaults():
    dc = DataConfig(csv_path="x.csv", output_dir="out")
    # Default keeps backward-compatible single-source behavior.
    assert dc.source_preference == ["alpaca", "yfinance"]


def test_config_alpaca_default_factory():
    # A Config built without an explicit alpaca block still has the default.
    cfg = Config(
        market={
            "symbol": "SPY",
            "session_start": "09:30:00",
            "session_end": "16:00:00",
            "no_new_trades_after": "15:30:00",
            "force_flat_time": "15:55:00",
        },
        data={"csv_path": "x.csv", "output_dir": "out"},
    )
    assert cfg.alpaca.feed == "iex"
