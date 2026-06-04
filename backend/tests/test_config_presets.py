"""T010 — built-in preset loader (Feature 012). Reads backend/config/presets/*.yaml
into {name, description, params} so 'create from preset' has real templates."""

from intraday_trade_spy.config_presets import load_presets


def test_load_presets_returns_known_presets():
    presets = load_presets()
    names = {p["name"] for p in presets}
    # The repo ships these preset files.
    assert {"aggressive", "low-risk"} <= names
    assert len(presets) >= 2


def test_each_preset_has_nested_params_and_description():
    for p in load_presets():
        assert isinstance(p["name"], str) and p["name"]
        assert isinstance(p["description"], str) and p["description"]
        params = p["params"]
        # Nested config shape (what configs.params stores) — must carry risk knobs.
        assert "risk" in params and "strategy" in params
        assert "max_position_value_pct" in params["risk"]


def test_presets_are_spy_only():
    for p in load_presets():
        market = p["params"].get("market", {})
        assert market.get("symbol", "SPY") == "SPY"
