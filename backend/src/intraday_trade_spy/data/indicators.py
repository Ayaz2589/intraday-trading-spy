from datetime import timedelta

import pandas as pd

from intraday_trade_spy.models import IndicatorSnapshot


def attach_indicators(df: pd.DataFrame, *, or_minutes: int) -> pd.DataFrame:
    df = df.copy()
    tp = (df["high"] + df["low"] + df["close"]) / 3
    df["_pv"] = tp * df["volume"]
    df["vwap"] = df.groupby("session_date")["_pv"].cumsum() / df.groupby("session_date")[
        "volume"
    ].cumsum().replace(0, pd.NA)
    df = df.drop(columns=["_pv"])

    pieces = []
    for _sess_date, g in df.groupby("session_date", sort=False):
        g = g.copy()
        session_open = g["timestamp"].iloc[0]
        cutoff = session_open + timedelta(minutes=or_minutes)
        in_or = g["timestamp"] < cutoff
        g["or_high"] = g.loc[in_or, "high"].cummax().reindex(g.index).ffill()
        g["or_low"] = g.loc[in_or, "low"].cummin().reindex(g.index).ffill()
        g["or_complete"] = g["timestamp"] >= cutoff
        pieces.append(g)
    df = pd.concat(pieces).sort_values("timestamp").reset_index(drop=True)

    df["distance_from_vwap_pct"] = (df["close"] - df["vwap"]) / df["vwap"] * 100
    df["prior_bar_close"] = df.groupby("session_date")["close"].shift(1)
    return df


def snapshot_from_row(row: pd.Series) -> IndicatorSnapshot:
    return IndicatorSnapshot(
        timestamp=row["timestamp"],
        vwap=float(row["vwap"]),
        or_high=None if pd.isna(row["or_high"]) else float(row["or_high"]),
        or_low=None if pd.isna(row["or_low"]) else float(row["or_low"]),
        or_complete=bool(row["or_complete"]),
        distance_from_vwap_pct=float(row["distance_from_vwap_pct"]),
        prior_bar_close=None if pd.isna(row["prior_bar_close"]) else float(row["prior_bar_close"]),
    )
