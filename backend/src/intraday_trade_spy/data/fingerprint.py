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
