"""Feature 022 — ReplayEngine: loading, indicators, manual fills, brackets,
force-flat, early-close safety, automation journaling (T010/T012/T028-T031/T041/T051)."""

from datetime import date
from zoneinfo import ZoneInfo

import pandas as pd
import pytest

from intraday_trade_spy.config import load_config
from intraday_trade_spy.data.loader import load_bars
from intraday_trade_spy.replay.engine import ReplayEngine, df_from_bar_rows

ET = ZoneInfo("America/New_York")
DAY = date(2026, 5, 26)


@pytest.fixture()
def cfg(default_config_path):
    return load_config(default_config_path)


def _one_day(sample_csv_path, cfg, day="2026-05-26"):
    df = load_bars(sample_csv_path, market=cfg.market)
    return df[df["session_date"].astype(str) == day].reset_index(drop=True)


def _syn(rows):
    """rows: (hh, mm, o, h, l, c) at session_date 2026-05-26."""
    recs = [
        {
            "symbol": "SPY",
            "timestamp": pd.Timestamp(2026, 5, 26, hh, mm, tz=ET),
            "open": o, "high": h, "low": lo, "close": c, "volume": 1_000_000,
            "session_date": DAY,
        }
        for (hh, mm, o, h, lo, c) in rows
    ]
    return pd.DataFrame(recs)


# ---- T010: loader -----------------------------------------------------------

def test_df_from_bar_rows_et_session_filtered_sorted(cfg):
    rows = [
        {"bar_start": "2026-05-26T13:30:00+00:00", "open": 1, "high": 2, "low": 1, "close": 1.5, "volume": 10},  # 09:30 ET
        {"bar_start": "2026-05-26T12:00:00+00:00", "open": 1, "high": 2, "low": 1, "close": 1.5, "volume": 10},  # 08:00 ET (pre-open, dropped)
        {"bar_start": "2026-05-26T13:35:00+00:00", "open": 1, "high": 2, "low": 1, "close": 1.5, "volume": 10},  # 09:35 ET
    ]
    df = df_from_bar_rows(rows, market=cfg.market)
    assert len(df) == 2  # pre-open bar filtered out
    assert list(df["timestamp"].dt.strftime("%H:%M")) == ["09:30", "09:35"]
    assert (df["session_date"].astype(str) == "2026-05-26").all()


# ---- T012: indicator snapshot per delivered bar -----------------------------

def test_delivered_bars_carry_vwap(cfg, sample_csv_path):
    eng = ReplayEngine(cfg=cfg, df=_one_day(sample_csv_path, cfg))
    eng.step(); eng.step(); eng.step()
    bars = eng.delivered_bars()
    assert len(bars) == 3
    assert all("vwap" in b and b["vwap"] is not None for b in bars)


# ---- T028: manual entry fills at the NEXT bar open (no look-ahead) ----------

def test_manual_entry_fills_next_bar_open(cfg, sample_csv_path):
    eng = ReplayEngine(cfg=cfg, df=_one_day(sample_csv_path, cfg))
    for _ in range(5):
        eng.step()
    last = eng.last_bar()
    out = eng.submit_manual(
        stop_loss=last.close - 1.0, take_profit=last.close + 2.0,
        price=last.close, now=last.timestamp,
    )
    assert out["approved"] is True
    assert eng.state.open_position is None  # not filled on the bar already seen
    eng.step()
    pos = eng.state.open_position
    assert pos is not None
    assert pos.entry_timestamp == eng.last_bar().timestamp
    assert pos.entry_timestamp > last.timestamp  # the bar AFTER submission
    assert pos.entry_price == pytest.approx(eng.last_bar().open + cfg.broker.slippage_per_share)


def test_manual_missing_valid_stop_rejected_and_journaled(cfg, sample_csv_path):
    eng = ReplayEngine(cfg=cfg, df=_one_day(sample_csv_path, cfg))
    eng.step()
    last = eng.last_bar()
    out = eng.submit_manual(
        stop_loss=last.close + 1.0,  # stop ABOVE price — invalid for a long
        take_profit=last.close + 2.0, price=last.close, now=last.timestamp,
    )
    assert out["approved"] is False
    assert out["reason"].startswith("invalid_levels")
    assert any(e["kind"] == "rejected" for e in eng.journal.events())


# ---- T029: bracket mutual exclusion + conservative stop-first --------------

def test_bracket_same_bar_span_fills_stop_first(cfg):
    df = _syn([
        (9, 30, 525.0, 525.2, 524.8, 525.10),
        (9, 35, 525.10, 525.30, 525.00, 525.20),     # entry fills here at open
        (9, 40, 525.20, 528.00, 523.00, 525.30),     # spans stop 524 AND target 527
    ])
    eng = ReplayEngine(cfg=cfg, df=df)
    eng.step()  # index 0
    last = eng.last_bar()
    eng.submit_manual(stop_loss=524.0, take_profit=527.0, price=last.close, now=last.timestamp)
    eng.step()  # index 1 — fills entry, bar tight (no exit)
    assert eng.state.open_position is not None
    eng.step()  # index 2 — both legs touched
    assert len(eng.trades) == 1
    t = eng.trades[0]
    assert t.exit_reason == "stop"
    assert t.same_bar_tiebreak == "stop_first"
    assert t.exit_price == pytest.approx(524.0 - cfg.broker.slippage_per_share)


# ---- T030: long-only — cannot close when flat ------------------------------

def test_close_when_flat_rejected(cfg, sample_csv_path):
    eng = ReplayEngine(cfg=cfg, df=_one_day(sample_csv_path, cfg))
    eng.step()
    out = eng.close_manual()
    assert out["accepted"] is False


# ---- T031: force-flat at 15:55 ---------------------------------------------

def test_force_flat_closes_open_position_at_cutoff(cfg):
    df = _syn([
        (9, 30, 525.0, 525.2, 524.8, 525.10),
        (9, 35, 525.10, 525.30, 525.00, 525.20),     # entry fills
        (15, 50, 525.20, 525.40, 525.10, 525.30),     # before cutoff, tight
        (15, 55, 525.30, 525.50, 525.20, 525.40),     # >= force_flat_time
    ])
    eng = ReplayEngine(cfg=cfg, df=df)
    eng.step()
    last = eng.last_bar()
    eng.submit_manual(stop_loss=523.0, take_profit=530.0, price=last.close, now=last.timestamp)
    eng.step(); eng.step(); eng.step()
    assert eng.state.open_position is None
    assert len(eng.trades) == 1
    assert eng.trades[0].exit_reason == "force_flat"
    assert any(e["kind"] == "force_flat" for e in eng.journal.events())


# ---- T051: early-close safety flatten (analyze finding C1) ------------------

def test_early_close_flattens_on_last_bar(cfg):
    # Last bar at 12:55 (early close) — the 15:55 cutoff is never reached, so a
    # position open at the final bar must still be flattened (no overnight).
    df = _syn([
        (9, 30, 525.0, 525.2, 524.8, 525.10),
        (9, 35, 525.10, 525.30, 525.00, 525.20),     # entry fills
        (12, 55, 525.20, 525.40, 525.10, 525.30),     # final bar, no stop/target hit
    ])
    eng = ReplayEngine(cfg=cfg, df=df)
    eng.step()
    last = eng.last_bar()
    eng.submit_manual(stop_loss=523.0, take_profit=540.0, price=last.close, now=last.timestamp)
    eng.step(); eng.step()
    assert eng.state.open_position is None  # not carried overnight
    assert len(eng.trades) == 1
    assert eng.trades[0].exit_reason == "force_flat"


# ---- T041: automation journals skips, never trades outside the window -------

def test_automation_tiny_window_skips_and_never_trades(cfg, sample_csv_path):
    # entry_window [0,1): OR completes at minute 15, so every valid setup is a
    # WindowSkip — zero executed trades, skips journaled if any setup exists.
    cfg.strategy.vwap_pullback.entry_window.start_minutes_after_open = 0
    cfg.strategy.vwap_pullback.entry_window.end_minutes_after_open = 1
    eng = ReplayEngine(cfg=cfg, df=_one_day(sample_csv_path, cfg), automation=True)
    while eng.step():
        pass
    assert eng.trades == []
    assert not any(e["kind"] == "executed" for e in eng.journal.events())
