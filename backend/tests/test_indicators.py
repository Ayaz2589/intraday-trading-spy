import pandas as pd

from intraday_trade_spy.config import MarketConfig
from intraday_trade_spy.data.indicators import attach_indicators
from intraday_trade_spy.data.loader import load_bars


def _market():
    return MarketConfig(
        symbol="SPY",
        session_start="09:30:00",
        session_end="16:00:00",
        no_new_trades_after="15:30:00",
        force_flat_time="15:55:00",
    )


def test_vwap_first_bar_equals_typical_price(sample_csv_path):
    df = load_bars(sample_csv_path, market=_market())
    df = attach_indicators(df, or_minutes=15)
    first_per_session = df.groupby("session_date").head(1)
    expected = (
        first_per_session["high"]
        + first_per_session["low"]
        + first_per_session["close"]
    ) / 3
    actual = first_per_session["vwap"]
    pd.testing.assert_series_equal(
        actual.reset_index(drop=True),
        expected.reset_index(drop=True),
        check_names=False,
        rtol=1e-9,
    )


def test_vwap_resets_each_session(sample_csv_path):
    df = load_bars(sample_csv_path, market=_market())
    df = attach_indicators(df, or_minutes=15)
    # First bar of each session is reset; we already validated above. Confirm via
    # checking that VWAP does NOT carry across the session boundary.
    session_dates = sorted(df["session_date"].unique())
    for i in range(1, len(session_dates)):
        prev_session_last = df[df["session_date"] == session_dates[i - 1]].iloc[-1]
        cur_session_first = df[df["session_date"] == session_dates[i]].iloc[0]
        # The new session's VWAP should equal that bar's typical price, not be
        # the running VWAP from the prior session.
        tp_first = (
            cur_session_first["high"]
            + cur_session_first["low"]
            + cur_session_first["close"]
        ) / 3
        assert abs(cur_session_first["vwap"] - tp_first) < 1e-9
        assert abs(cur_session_first["vwap"] - prev_session_last["vwap"]) > 0.0001


def test_or_complete_flag(sample_csv_path):
    df = load_bars(sample_csv_path, market=_market())
    df = attach_indicators(df, or_minutes=15)
    # Pick one session and find bars at exact 09:40 and 09:45.
    sess = df["session_date"].min()
    in_session = df[df["session_date"] == sess]
    bar_at_945 = in_session[in_session["timestamp"].dt.time == pd.Timestamp("09:45").time()].iloc[0]
    bar_at_940 = in_session[in_session["timestamp"].dt.time == pd.Timestamp("09:40").time()].iloc[0]
    assert bool(bar_at_945["or_complete"]) is True
    assert bool(bar_at_940["or_complete"]) is False
