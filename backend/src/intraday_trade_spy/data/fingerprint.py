import hashlib
from pathlib import Path

import pandas as pd

from intraday_trade_spy.models import DataFingerprint

ET = "America/New_York"


def fingerprint_csv(path: str | Path) -> DataFingerprint:
    raw = Path(path).read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    df = pd.read_csv(path)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True).dt.tz_convert(ET)
    return DataFingerprint(
        sha256=sha,
        bar_count=len(df),
        earliest_timestamp=df["timestamp"].min(),
        latest_timestamp=df["timestamp"].max(),
        session_count=int(df["timestamp"].dt.date.nunique()),
    )


_CANON_COLS = ["symbol", "timestamp", "open", "high", "low", "close", "volume"]


def fingerprint_df(df: pd.DataFrame) -> DataFingerprint:
    """Feature 011: a content-based fingerprint for an in-memory bar frame (the
    validation engine slices a loaded frame per window, so there is no CSV to
    hash). The sha256 is over a canonical OHLCV serialization, so two frames
    with identical bars fingerprint identically regardless of provenance."""
    ts = pd.to_datetime(df["timestamp"], utc=True)
    canon = df.assign(timestamp=ts.dt.strftime("%Y-%m-%dT%H:%M:%S%z"))[
        _CANON_COLS
    ].to_csv(index=False).encode()
    sha = hashlib.sha256(canon).hexdigest()
    et = ts.dt.tz_convert(ET)
    return DataFingerprint(
        sha256=sha,
        bar_count=len(df),
        earliest_timestamp=et.min(),
        latest_timestamp=et.max(),
        session_count=int(et.dt.date.nunique()),
    )
