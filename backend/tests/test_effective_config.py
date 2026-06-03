"""build_effective_config merges the user's saved config knobs (risk/strategy)
over the base config.yaml, so the engine actually runs with those knobs instead
of the static defaults. The base supplies the parts the UI doesn't set
(session times, data paths, broker)."""

from intraday_trade_spy.config import build_effective_config, load_config


def test_empty_params_equals_base_config(default_config_path):
    eff = build_effective_config({}, base_path=default_config_path)
    base = load_config(default_config_path)
    assert eff.model_dump() == base.model_dump()


def test_none_params_equals_base_config(default_config_path):
    eff = build_effective_config(None, base_path=default_config_path)
    base = load_config(default_config_path)
    assert eff.model_dump() == base.model_dump()


def test_account_value_knob_overrides_base(default_config_path):
    eff = build_effective_config(
        {"risk": {"account_value": 500}}, base_path=default_config_path
    )
    base = load_config(default_config_path)
    assert eff.risk.account_value == 500
    # an untouched risk field falls back to the base, not lost by the merge
    assert eff.risk.max_daily_loss_pct == base.risk.max_daily_loss_pct


def test_nested_strategy_knob_overrides_without_clobbering_siblings(default_config_path):
    eff = build_effective_config(
        {"strategy": {"vwap_pullback": {"target": {"risk_reward": 3.0}}}},
        base_path=default_config_path,
    )
    base = load_config(default_config_path)
    assert eff.strategy.vwap_pullback.target.risk_reward == 3.0
    # sibling subtrees preserved from base (deep merge, not wholesale replace)
    assert (
        eff.strategy.vwap_pullback.max_distance_from_vwap_pct
        == base.strategy.vwap_pullback.max_distance_from_vwap_pct
    )
    assert eff.strategy.opening_range.minutes == base.strategy.opening_range.minutes


def test_market_and_data_come_from_base(default_config_path):
    # The UI never sets market/data; the engine still needs them from the base.
    eff = build_effective_config(
        {"risk": {"account_value": 12345}}, base_path=default_config_path
    )
    base = load_config(default_config_path)
    assert eff.market.session_start == base.market.session_start
    assert eff.data.csv_path == base.data.csv_path
