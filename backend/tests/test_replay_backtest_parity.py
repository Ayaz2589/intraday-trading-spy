"""Feature 022 (T040, SC-004) — automation-only replay == backtest.

A max-speed, automation-only replay of a session produces trades identical to a
backtest of the same date/config — because both run the SAME
strategy→risk→broker/paper.py primitives over the same bars. This is the
linchpin guarantee behind "see what strategies will work."."""

from datetime import date

import pytest

from intraday_trade_spy.backtest.engine import BacktestEngine
from intraday_trade_spy.config import load_config
from intraday_trade_spy.data.loader import load_bars
from intraday_trade_spy.models import SignalStatus
from intraday_trade_spy.replay.engine import ReplayEngine

DAYS = ["2026-05-26", "2026-05-27", "2026-05-28"]


def _replay_trades(cfg, df):
    eng = ReplayEngine(cfg=cfg, df=df, automation=True)
    while eng.step():
        pass
    return [
        (round(t.entry_price, 4), round(t.exit_price, 4), t.exit_reason,
         round(t.realized_r or 0.0, 6), t.plan.quantity)
        for t in eng.trades
    ]


def _backtest_trades(cfg, df):
    res = BacktestEngine(cfg).run_df(df)
    out = []
    for r in res.journal_rows:
        if r.status in (SignalStatus.EXITED, SignalStatus.FORCE_FLAT):
            out.append(
                (round(r.actual_entry, 4), round(r.actual_exit, 4),
                 r.exit_reason, round(r.realized_r or 0.0, 6), r.quantity)
            )
    return out


@pytest.mark.parametrize("day", DAYS)
def test_replay_matches_backtest_per_day(default_config_path, sample_csv_path, day):
    cfg = load_config(default_config_path)
    df = load_bars(sample_csv_path, market=cfg.market)
    df = df[df["session_date"].astype(str) == day].reset_index(drop=True)
    assert _replay_trades(cfg, df) == _backtest_trades(cfg, df)


def test_sample_produces_at_least_one_trade(default_config_path, sample_csv_path):
    cfg = load_config(default_config_path)
    df = load_bars(sample_csv_path, market=cfg.market)
    total = 0
    for day in DAYS:
        d = df[df["session_date"].astype(str) == day].reset_index(drop=True)
        total += len(_replay_trades(cfg, d))
    assert total >= 1  # parity above is meaningful, not vacuously empty
