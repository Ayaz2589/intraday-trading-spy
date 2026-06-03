"""Bar-source seam (Feature 009).

A `BarSource` produces normalized OHLCV rows for SPY, vendor-agnostic, so the
backfill and read paths don't care whether the bars came from yfinance or
Alpaca. A `BarRow` is the dict shape `storage.upsert_bars` already consumes:

    {bar_start: ISO-8601 str, open, high, low, close, volume, source}

SPY-only is enforced at the boundary (constitution I). The `symbol` parameter
exists so this seam is symbol-parameterizable for a future expansion, but any
non-SPY symbol raises today.
"""

from __future__ import annotations

import csv
import tempfile
from datetime import date
from pathlib import Path
from typing import Protocol, runtime_checkable

BarRow = dict  # {bar_start, open, high, low, close, volume, source}

_NORMALIZED_COLS = ["symbol", "timestamp", "open", "high", "low", "close", "volume"]


def require_spy(symbol: str) -> None:
    """Constitution I: this feature is SPY-only."""
    if symbol != "SPY":
        raise ValueError(
            f"Feature 009 data layer is SPY-only; got symbol={symbol!r}. "
            "Multi-symbol support requires a constitution amendment (Principle I)."
        )


def rows_from_normalized_csv(path: Path, *, source: str) -> list[BarRow]:
    """Parse a Downloader-normalized OHLCV CSV into BarRow dicts.

    Keeps only SPY rows and stamps the given source. Values stay as strings;
    `upsert_bars` coerces to numeric.
    """
    out: list[BarRow] = []
    with Path(path).open() as f:
        reader = csv.DictReader(f)
        for r in reader:
            if r.get("symbol") != "SPY":
                continue
            out.append(
                {
                    "bar_start": r["timestamp"],
                    "open": r["open"],
                    "high": r["high"],
                    "low": r["low"],
                    "close": r["close"],
                    "volume": r["volume"],
                    "source": source,
                }
            )
    return out


@runtime_checkable
class BarSource(Protocol):
    name: str

    def fetch_rows(
        self, *, start: date, end: date, symbol: str = "SPY", timeframe: str = "5m"
    ) -> list[BarRow]: ...


class YfinanceBarSource:
    """Adapter wrapping the existing yfinance `Downloader` behind the seam.

    `downloader` is injectable for tests; production constructs a `Downloader`.
    """

    name = "yfinance"

    def __init__(self, downloader=None) -> None:
        self._downloader = downloader

    def fetch_rows(
        self, *, start: date, end: date, symbol: str = "SPY", timeframe: str = "5m"
    ) -> list[BarRow]:
        require_spy(symbol)
        from intraday_trade_spy.data.downloader import (
            Downloader,
            DownloadRequest,
            NoBarsFetchedError,
        )

        dl = self._downloader if self._downloader is not None else Downloader()
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tf:
            tmp = Path(tf.name)
        try:
            try:
                dl.fetch(
                    DownloadRequest(
                        start=start,
                        end=end,
                        timeframe=timeframe,
                        out=tmp,
                        force=True,
                        show_progress=False,
                    )
                )
            except NoBarsFetchedError:
                return []
            return rows_from_normalized_csv(tmp, source=self.name)
        finally:
            tmp.unlink(missing_ok=True)
            tmp.with_suffix(tmp.suffix + ".fetch.yaml").unlink(missing_ok=True)
