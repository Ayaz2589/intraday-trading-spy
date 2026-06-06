"""T010 — built-in preset loader (Feature 012). Reads backend/config/presets/*.yaml
into {name, label, description, params} so 'create from preset' has real templates."""

import intraday_trade_spy.config_presets as config_presets
from intraday_trade_spy.config_presets import load_presets


def test_load_presets_returns_known_presets():
    presets = load_presets()
    names = {p["name"] for p in presets}
    # The repo ships these preset files.
    assert {"aggressive", "low-risk"} <= names
    assert len(presets) >= 2


def test_each_preset_has_a_human_label():
    """Strategy-page cleanup: presets carry a human-readable label (from the
    YAML's `# LABEL:` header) alongside the canonical file-stem name."""
    presets = load_presets()
    by_name = {p["name"]: p for p in presets}
    for p in presets:
        assert isinstance(p["label"], str) and p["label"]
        assert p["label"] != p["name"]  # shipped presets are all labeled
    assert by_name["aggressive"]["label"] == "Aggressive — bigger swings"
    assert by_name["demo"]["label"] == "Demo — pipeline smoke test"
    assert by_name["low-risk"]["label"] == "Low risk — half-size trades"
    assert by_name["vwap50"]["label"] == "Wide VWAP band — exp 005 winner"


def test_label_falls_back_to_the_preset_name(tmp_path, monkeypatch):
    (tmp_path / "bare.yaml").write_text(
        "risk:\n  max_position_value_pct: 100.0\nstrategy:\n  enabled: true\n"
    )
    monkeypatch.setattr(config_presets, "PRESETS_DIR", tmp_path)
    presets = load_presets()
    assert presets == [
        {"name": "bare", "label": "bare", "description": "bare", "params": {
            "risk": {"max_position_value_pct": 100.0}, "strategy": {"enabled": True},
        }}
    ]


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
