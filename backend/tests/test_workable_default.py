"""T029/T030 — the shipped default + position-cap must let an intraday strategy
actually trade (Feature 012, FR-011/FR-015).

The discovered 0-trade wall: at a realistic risk level the risk-based position
size exceeds `max_position_value_pct`, so signals never become trades. The fix
ships a 4x-intraday-buying-power cap (400) in version control. These tests pin
that (a) the contrast is real, (b) the shipped default trades, and (c) raising
the cap did NOT weaken the daily-loss veto.
"""

from pathlib import Path

import pytest

from intraday_trade_spy.backtest.engine import BacktestEngine
from intraday_trade_spy.config import build_effective_config, load_config
from intraday_trade_spy.config_presets import load_presets
from intraday_trade_spy.data.loader import load_bars

CONFIG_YAML = Path(__file__).resolve().parents[1] / "config" / "config.yaml"
FIXTURE = Path(__file__).resolve().parents[1] / "data" / "raw" / "spy_5m_2026-04-29_2026-05-28.csv"


def _trades(params: dict, df) -> int:
    res = BacktestEngine(build_effective_config(params)).run_df(df)
    return res.summary.total_trades


@pytest.fixture(scope="module")
def df():
    cfg = build_effective_config({})
    return load_bars(FIXTURE, market=cfg.market)


def test_shipped_default_cap_is_intraday_workable():
    # Version-controlled fix: 4x intraday buying power, not the 0-trade 100%.
    cfg = load_config(CONFIG_YAML)
    assert cfg.risk.max_position_value_pct == 400.0


def test_position_cap_fix_is_what_unblocks_trades(df):
    # At a realistic risk level, cap=100 produces ~0 trades; cap=400 unblocks them.
    broken = _trades({"risk": {"max_risk_per_trade_pct": 0.5, "max_position_value_pct": 100}}, df)
    fixed = _trades({"risk": {"max_risk_per_trade_pct": 0.5, "max_position_value_pct": 400}}, df)
    assert broken == 0
    assert fixed > 0
    assert fixed > broken


def test_shipped_default_executes_trades(df):
    # A fresh config from the shipped default actually trades over a month.
    assert _trades({}, df) > 0


@pytest.mark.parametrize("preset", load_presets(), ids=lambda p: p["name"])
def test_each_builtin_preset_executes_trades(preset, df):
    # T030/T031: every shipped preset must clear the 0-trade wall over the
    # fixture month. A preset that pairs raised risk with a 100% cap (the old
    # `aggressive`) rejects nearly every signal — those caps are the bug.
    assert _trades(preset["params"], df) > 0, f"preset {preset['name']!r} executed 0 trades"


def test_preset_loss_controls_are_not_weakened(df):
    # The cap raise must not disable the per-preset loss controls: clamping the
    # daily-loss limit to near-zero must still cut trading short for each preset.
    for preset in load_presets():
        params = preset["params"]
        normal = _trades(params, df)
        clamped = {**params, "risk": {**params["risk"], "max_daily_loss_pct": 0.02}}
        assert _trades(clamped, df) <= normal, f"daily-loss veto not binding for {preset['name']!r}"


def test_daily_loss_veto_still_binds_at_higher_cap(df):
    # Raising the position-value cap must NOT disable the loss controls: a tiny
    # daily-loss limit must still cut trading short relative to the normal limit.
    normal = _trades(
        {"risk": {"max_risk_per_trade_pct": 0.5, "max_position_value_pct": 400, "max_daily_loss_pct": 2.0}},
        df,
    )
    tiny = _trades(
        {"risk": {"max_risk_per_trade_pct": 0.5, "max_position_value_pct": 400, "max_daily_loss_pct": 0.02}},
        df,
    )
    assert tiny < normal  # the daily-loss circuit breaker still bites
