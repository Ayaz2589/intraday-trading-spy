"""Feature 009 — backfill CLI core (TDD, constitution IV)."""

from __future__ import annotations

from datetime import date
from unittest import mock

from scripts.backfill_bars import run_backfill


class FakeSource:
    name = "alpaca"

    def __init__(self, rows_by_call):
        self._rows_by_call = list(rows_by_call)
        self.calls = []

    def fetch_rows(self, *, start, end, symbol="SPY", timeframe="5m"):
        self.calls.append((start, end))
        return self._rows_by_call.pop(0) if self._rows_by_call else []


def test_run_backfill_sums_inserts_and_records_gaps():
    # 2018-01-01..2018-12-31 with 365-day windows = 1 window; give it 1500 rows
    # so it upserts in two 1000-chunks.
    rows = [{"bar_start": f"r{i}"} for i in range(1500)]
    src = FakeSource([rows])
    stub = mock.MagicMock()
    stub.upsert_bars.side_effect = lambda chunk: len(chunk)

    result = run_backfill(
        storage_client=stub, bar_source=src,
        start=date(2018, 1, 1), end=date(2018, 12, 31), window_days=365, log=lambda *_: None,
    )
    assert result["bars_added"] == 1500
    assert result["windows"] == 1
    assert result["gaps"] == []
    assert stub.upsert_bars.call_count == 2  # 1000 + 500


def test_run_backfill_records_empty_windows_as_gaps():
    src = FakeSource([[]])  # window returns nothing
    stub = mock.MagicMock()
    result = run_backfill(
        storage_client=stub, bar_source=src,
        start=date(2018, 1, 1), end=date(2018, 6, 30), window_days=365, log=lambda *_: None,
    )
    assert result["bars_added"] == 0
    assert len(result["gaps"]) == 1
    stub.upsert_bars.assert_not_called()


def test_run_backfill_multiple_windows():
    # 2018..2019 with 365-day windows = 2 windows.
    src = FakeSource([[{"bar_start": "a"}], [{"bar_start": "b"}]])
    stub = mock.MagicMock()
    stub.upsert_bars.side_effect = lambda chunk: len(chunk)
    result = run_backfill(
        storage_client=stub, bar_source=src,
        start=date(2018, 1, 1), end=date(2019, 12, 31), window_days=365, log=lambda *_: None,
    )
    assert result["windows"] == 2
    assert result["bars_added"] == 2
    assert len(src.calls) == 2
