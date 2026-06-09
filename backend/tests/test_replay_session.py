"""Feature 022 (T006/T035) — ReplaySession state snapshot + recap."""

from datetime import date
from zoneinfo import ZoneInfo

import pytest

from intraday_trade_spy.config import load_config
from intraday_trade_spy.data.loader import load_bars
from intraday_trade_spy.replay.engine import ReplayEngine
from intraday_trade_spy.replay.session import ReplaySession, build_performance

ET = ZoneInfo("America/New_York")


@pytest.fixture()
def cfg(default_config_path):
    return load_config(default_config_path)


def _engine(cfg, sample_csv_path, *, automation=False, day="2026-05-26"):
    df = load_bars(sample_csv_path, market=cfg.market)
    df = df[df["session_date"].astype(str) == day].reset_index(drop=True)
    return ReplayEngine(cfg=cfg, df=df, automation=automation)


def test_state_dict_shape_and_sim_clock_starts_at_open(cfg, sample_csv_path):
    eng = _engine(cfg, sample_csv_path)
    s = ReplaySession(
        id="abc", user_id="u", session_date=date(2026, 5, 26),
        config_snapshot={}, speed=60, engine=eng,
    )
    state = s.state_dict()
    assert state["session"]["status"] == "playing"
    assert state["session"]["bars_total"] == eng.bars_total
    assert state["session"]["bars_delivered"] == 0
    assert state["market"]["is_simulation"] is True
    assert state["position"] is None
    assert s.sim_clock == eng.session_open_time()


def test_state_reflects_open_position(cfg, sample_csv_path):
    eng = _engine(cfg, sample_csv_path)
    eng.step(); eng.step()
    last = eng.last_bar()
    eng.submit_manual(stop_loss=last.close - 1, take_profit=last.close + 1,
                      price=last.close, now=last.timestamp)
    eng.step()
    s = ReplaySession(id="a", user_id="u", session_date=date(2026, 5, 26),
                      config_snapshot={}, speed=60, engine=eng)
    pos = s.state_dict()["position"]
    assert pos is not None
    assert pos["qty"] > 0
    assert pos["stop_loss"] == pytest.approx(last.close - 1)


def test_build_performance_seeded_curve_and_rows(cfg, sample_csv_path):
    eng = _engine(cfg, sample_csv_path, automation=True)
    while eng.step():
        pass
    perf = build_performance(eng)
    assert set(perf) == {"summary", "equity_curve", "trades"}
    # equity curve starts at the seed (account value, null timestamp)
    assert perf["equity_curve"][0]["t"] is None
    assert perf["equity_curve"][0]["equity"] == pytest.approx(cfg.risk.account_value)
    assert perf["summary"]["trades"] == len(perf["trades"])
