from pathlib import Path

import pandas as pd

from intraday_trade_spy.config import MarketConfig

ET = "America/New_York"


def load_bars(path: str | Path, *, market: MarketConfig) -> pd.DataFrame:
    df = pd.read_csv(path)
    bad = sorted(set(df["symbol"]) - {"SPY"})
    if bad:
        raise ValueError(
            f"Non-SPY symbols present: {bad} (constitution principle I)"
        )
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True).dt.tz_convert(ET)
    session_start = pd.to_datetime(market.session_start).time()
    session_end = pd.to_datetime(market.session_end).time()
    mask = (df["timestamp"].dt.time >= session_start) & (
        df["timestamp"].dt.time < session_end
    )
    df = df.loc[mask].copy()
    df["session_date"] = df["timestamp"].dt.date
    df = df.sort_values("timestamp", kind="mergesort").reset_index(drop=True)
    return df
