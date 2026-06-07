"""Feature 022 — ReplayRunner pacing + pause (T011/T042/T047)."""

from datetime import date
from zoneinfo import ZoneInfo

import pytest

from intraday_trade_spy.config import load_config
from intraday_trade_spy.data.loader import load_bars
from intraday_trade_spy.replay.engine import ReplayEngine
from intraday_trade_spy.replay.runner import ReplayRunner
from intraday_trade_spy.replay.session import ReplaySession

ET = ZoneInfo("America/New_York")


@pytest.fixture()
def cfg(default_config_path):
    return load_config(default_config_path)


def _session(cfg, sample_csv_path, *, speed, automation=False, day="2026-05-26"):
    df = load_bars(sample_csv_path, market=cfg.market)
    df = df[df["session_date"].astype(str) == day].reset_index(drop=True)
    engine = ReplayEngine(cfg=cfg, df=df, automation=automation)
    return ReplaySession(
        id="t", user_id="u", session_date=date.fromisoformat(day),
        config_snapshot={}, speed=speed, engine=engine,
    )


def test_speed_surfaces_bars_at_boundaries(cfg, sample_csv_path):
    s = _session(cfg, sample_csv_path, speed=60)  # 60 sim-sec per real-sec
    r = ReplayRunner(session=s)
    # sim_clock starts at 09:30; +3600 sim-sec → 10:30. Bars 09:30..10:30
    # inclusive = 13 five-minute bars.
    r.advance(60.0)
    assert s.engine.delivered == 13
    assert s.status == "playing"


def test_high_speed_processes_all_bars_no_skips(cfg, sample_csv_path):
    s = _session(cfg, sample_csv_path, speed=3600)
    r = ReplayRunner(session=s)
    r.advance(60.0)  # a giant jump
    assert s.engine.delivered == s.engine.bars_total
    assert s.status == "completed"
    assert any(e["kind"] == "replay_completed" for e in s.engine.journal.events())


def test_pause_halts_delivery_then_resumes(cfg, sample_csv_path):
    s = _session(cfg, sample_csv_path, speed=60)
    r = ReplayRunner(session=s)
    r.advance(10.0)
    delivered = s.engine.delivered
    assert delivered > 0
    r.pause()
    r.advance(60.0)  # ignored while paused
    assert s.engine.delivered == delivered
    r.play()
    r.advance(60.0)
    assert s.engine.delivered > delivered


def test_pause_preserves_open_position(cfg, sample_csv_path):
    s = _session(cfg, sample_csv_path, speed=300)
    r = ReplayRunner(session=s)
    r.advance(2.0)  # reveal several bars
    last = s.engine.last_bar()
    s.engine.submit_manual(
        stop_loss=last.close - 1.0, take_profit=last.close + 1.0,
        price=last.close, now=last.timestamp,
    )
    r.advance(0.1)  # fill
    pos_before = s.engine.state.open_position
    r.pause()
    r.advance(10.0)
    assert s.engine.state.open_position is pos_before  # untouched while paused
