"""Feature 009 — BarSource seam + yfinance adapter (TDD, constitution IV)."""

from __future__ import annotations

import csv
from datetime import date
from pathlib import Path

import pytest

from intraday_trade_spy.data.bar_source import (
    BarSource,
    YfinanceBarSource,
    rows_from_normalized_csv,
)

NORMALIZED_COLS = ["symbol", "timestamp", "open", "high", "low", "close", "volume"]


def _write_normalized_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=NORMALIZED_COLS)
        w.writeheader()
        for r in rows:
            w.writerow(r)


def test_yfinance_source_name():
    assert YfinanceBarSource().name == "yfinance"


def test_yfinance_source_is_a_barsource():
    assert isinstance(YfinanceBarSource(), BarSource)


def test_yfinance_source_rejects_non_spy():
    with pytest.raises(ValueError):
        YfinanceBarSource().fetch_rows(start=date(2024, 1, 2), end=date(2024, 1, 3), symbol="QQQ")


def test_rows_from_normalized_csv_filters_to_spy_and_stamps_source(tmp_path):
    csv_path = tmp_path / "bars.csv"
    _write_normalized_csv(
        csv_path,
        [
            {"symbol": "SPY", "timestamp": "2024-01-02T09:30:00-05:00", "open": "470.1", "high": "470.5", "low": "469.9", "close": "470.3", "volume": "1000"},
            {"symbol": "QQQ", "timestamp": "2024-01-02T09:30:00-05:00", "open": "1", "high": "1", "low": "1", "close": "1", "volume": "1"},
        ],
    )
    rows = rows_from_normalized_csv(csv_path, source="yfinance")
    assert len(rows) == 1
    r = rows[0]
    assert set(r) == {"bar_start", "open", "high", "low", "close", "volume", "source"}
    assert r["bar_start"] == "2024-01-02T09:30:00-05:00"
    assert r["source"] == "yfinance"
    assert r["open"] == "470.1"


def test_yfinance_source_returns_normalized_rows_via_injected_downloader(tmp_path):
    class FakeDownloader:
        def fetch(self, req):
            _write_normalized_csv(
                req.out,
                [
                    {"symbol": "SPY", "timestamp": "2024-01-02T09:30:00-05:00", "open": "470", "high": "471", "low": "469", "close": "470.5", "volume": "5000"},
                ],
            )
            return None

    src = YfinanceBarSource(downloader=FakeDownloader())
    rows = src.fetch_rows(start=date(2026, 5, 1), end=date(2026, 5, 1))
    assert len(rows) == 1
    assert rows[0]["source"] == "yfinance"
    assert rows[0]["bar_start"] == "2024-01-02T09:30:00-05:00"


def test_yfinance_source_empty_when_no_bars(tmp_path):
    from intraday_trade_spy.data.downloader import NoBarsFetchedError

    class EmptyDownloader:
        def fetch(self, req):
            raise NoBarsFetchedError("no data")

    rows = YfinanceBarSource(downloader=EmptyDownloader()).fetch_rows(
        start=date(2026, 5, 1), end=date(2026, 5, 2)
    )
    assert rows == []
