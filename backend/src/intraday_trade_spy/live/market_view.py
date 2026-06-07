"""Feature 021 — chart view computation (contracts/trade-api.md bars).

Pure transforms: a 1-minute frame becomes the 1m/5m/1d views (with
session-anchored VWAP); a daily frame becomes the 30d view (no VWAP — it is
session-anchored by definition and meaningless on daily candles)."""

from __future__ import annotations

from datetime import datetime

import pandas as pd


def _vwap(df: pd.DataFrame) -> pd.Series:
    tp = (df["high"] + df["low"] + df["close"]) / 3
    pv = (tp * df["volume"]).cumsum()
    vol = df["volume"].cumsum().replace(0, pd.NA)
    return pv / vol


def _bucket_5m(df: pd.DataFrame) -> pd.DataFrame:
    ts = pd.to_datetime(df["timestamp"])
    bucket = ts.dt.floor("5min")
    g = df.assign(_bucket=bucket).groupby("_bucket", sort=True)
    out = pd.DataFrame({
        "timestamp": g["timestamp"].first().index,
        "open": g["open"].first().values,
        "high": g["high"].max().values,
        "low": g["low"].min().values,
        "close": g["close"].last().values,
        "volume": g["volume"].sum().values,
    })
    return out


def _rows(df: pd.DataFrame, vwap: pd.Series | None) -> list[dict]:
    out = []
    for i, row in df.reset_index(drop=True).iterrows():
        v = None
        if vwap is not None:
            val = vwap.iloc[i]
            v = None if pd.isna(val) else float(val)
        out.append({
            "t": row["timestamp"].isoformat(),
            "o": float(row["open"]), "h": float(row["high"]),
            "l": float(row["low"]), "c": float(row["close"]),
            "v": int(row["volume"]), "vwap": v,
        })
    return out


def intraday_view(df_1m: pd.DataFrame, *, view: str,
                  since: str | datetime | None = None) -> list[dict]:
    """1m: the session's minute bars; 5m and 1d: 5-minute buckets of the
    session (the 1d view is simply the full session at 5-minute zoom).
    VWAP is session-anchored over whatever granularity is displayed."""
    if df_1m.empty:
        return []
    df = df_1m.sort_values("timestamp").reset_index(drop=True)
    if view in ("5m", "1d"):
        df = _bucket_5m(df)
    bars = _rows(df, _vwap(df))
    if since is not None:
        cut = since if isinstance(since, str) else since.isoformat()
        bars = [b for b in bars if b["t"] > cut]
    return bars


def daily_view(df_daily: pd.DataFrame,
               since: str | datetime | None = None) -> list[dict]:
    if df_daily.empty:
        return []
    df = df_daily.sort_values("timestamp").reset_index(drop=True)
    bars = _rows(df, None)
    if since is not None:
        cut = since if isinstance(since, str) else since.isoformat()
        bars = [b for b in bars if b["t"] > cut]
    return bars
