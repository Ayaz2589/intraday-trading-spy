"""T047 — random-entry permutation null (Feature 011, FR-014).

The null answers "could random entries under identical exit/risk/cost rules have
done this?" Per iteration it greedily samples non-overlapping LONG entries at
eligible bars (clock: tradeable + no overnight), reuses the PaperBroker for
stop/target/force-flat + costs, and totals net PnL. Seeded for reproducibility.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from intraday_trade_spy.broker.paper import PaperBroker
from intraday_trade_spy.clock import MarketClock
from intraday_trade_spy.models import Bar
from intraday_trade_spy.validation.random_entry import random_entry_null

ET = ZoneInfo("America/New_York")


def _clock():
    from datetime import time

    return MarketClock(
        session_start=time(9, 30), session_end=time(16, 0),
        no_new_trades_after=time(15, 30), force_flat_time=time(15, 55),
    )


def _session_bars(n=40):
    """n 5-min bars on one session, gently rising with intrabar range."""
    start = datetime(2026, 5, 26, 9, 30, tzinfo=ET)
    bars = []
    price = 100.0
    for i in range(n):
        ts = start + timedelta(minutes=5 * i)
        o = price
        c = price + 0.05
        bars.append(
            Bar(symbol="SPY", timestamp=ts, open=o, high=c + 0.1, low=o - 0.1,
                close=c, volume=1000, session_date=ts.date())
        )
        price = c
    return bars


def test_null_is_deterministic_with_seed():
    bars, clock, broker = _session_bars(), _clock(), PaperBroker(slippage_per_share=0.01)
    kw = dict(bars=bars, clock=clock, broker=broker, n_trades=3,
              stop_distance=0.5, risk_reward=2.0, quantity=10, iterations=200, seed=42)
    a = random_entry_null(**kw)
    b = random_entry_null(**kw)
    assert a == b
    assert len(a) == 200


def test_null_respects_clock_no_new_trades_cutoff(monkeypatch):
    bars, clock, broker = _session_bars(), _clock(), PaperBroker()
    # Spy on which entry bars get used: every entry must satisfy allow_new_trades.
    from intraday_trade_spy.validation import random_entry as re_mod

    used = []
    orig = re_mod._simulate_random_trade

    def _wrapped(bars, entry_idx, **kw):
        used.append(bars[entry_idx].timestamp)
        return orig(bars, entry_idx, **kw)

    monkeypatch.setattr(re_mod, "_simulate_random_trade", _wrapped)
    random_entry_null(bars=bars, clock=clock, broker=broker, n_trades=3,
                      stop_distance=0.5, risk_reward=2.0, quantity=10, iterations=50, seed=1)
    assert used, "expected some entries"
    assert all(clock.allow_new_trades(ts) for ts in used)


def test_null_handles_zero_trades():
    bars, clock, broker = _session_bars(), _clock(), PaperBroker()
    out = random_entry_null(bars=bars, clock=clock, broker=broker, n_trades=0,
                            stop_distance=0.5, risk_reward=2.0, quantity=10, iterations=10, seed=1)
    assert out == [0.0] * 10
