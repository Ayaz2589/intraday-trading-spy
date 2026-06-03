"""Feature 009 — backfill runner (TDD, constitution IV + V guard)."""

from __future__ import annotations

from datetime import date
from unittest import mock
from uuid import uuid4

import pytest

from intraday_trade_spy.api.lifecycle import _run_backfill_task


class FakeSource:
    name = "alpaca"

    def __init__(self, rows_per_window, *, raise_on=None):
        self._rows = rows_per_window
        self._raise_on = raise_on
        self.calls = []

    def fetch_rows(self, *, start, end, symbol="SPY", timeframe="5m"):
        self.calls.append((start, end))
        if self._raise_on is not None and len(self.calls) >= self._raise_on:
            raise RuntimeError("boom")
        return list(self._rows)


def _statuses(stub):
    return [
        c.kwargs.get("status")
        for c in stub.update_backfill_job.call_args_list
        if c.kwargs.get("status") is not None
    ]


def test_runner_happy_path_loops_windows_and_finishes():
    stub = mock.MagicMock()
    stub.upsert_bars.return_value = 1
    src = FakeSource([{"bar_start": "x"}])
    _run_backfill_task(
        job_id=uuid4(), user_id=uuid4(), start_date=date(2018, 1, 1),
        end_date=date(2018, 2, 15), source="alpaca", storage_client=stub, bar_source=src,
    )
    # 46-day span / 30-day windows = 2 windows
    assert len(src.calls) == 2
    assert _statuses(stub)[0] == "running"
    assert _statuses(stub)[-1] == "finished"
    final = stub.update_backfill_job.call_args_list[-1].kwargs
    assert final["windows_done"] == 2
    assert final["bars_added"] == 2  # 2 windows * 1 inserted each


def test_runner_idempotent_zero_inserts_keeps_bars_added_zero():
    stub = mock.MagicMock()
    stub.upsert_bars.return_value = 0  # everything already cached
    src = FakeSource([{"bar_start": "x"}])
    _run_backfill_task(
        job_id=uuid4(), user_id=uuid4(), start_date=date(2018, 1, 1),
        end_date=date(2018, 1, 20), source="alpaca", storage_client=stub, bar_source=src,
    )
    final = stub.update_backfill_job.call_args_list[-1].kwargs
    assert final["status"] == "finished"
    assert final["bars_added"] == 0


def test_runner_records_empty_windows_as_gaps():
    stub = mock.MagicMock()
    stub.upsert_bars.return_value = 0
    src = FakeSource([])  # source returns nothing
    _run_backfill_task(
        job_id=uuid4(), user_id=uuid4(), start_date=date(2018, 1, 1),
        end_date=date(2018, 1, 20), source="alpaca", storage_client=stub, bar_source=src,
    )
    final = stub.update_backfill_job.call_args_list[-1].kwargs
    assert final["status"] == "finished"
    assert final["gap_session_dates"]  # non-empty
    stub.upsert_bars.assert_not_called()


def test_runner_marks_failed_on_source_error():
    stub = mock.MagicMock()
    src = FakeSource([{"bar_start": "x"}], raise_on=1)
    _run_backfill_task(
        job_id=uuid4(), user_id=uuid4(), start_date=date(2018, 1, 1),
        end_date=date(2018, 1, 10), source="alpaca", storage_client=stub, bar_source=src,
    )
    assert _statuses(stub)[-1] == "failed"
    assert stub.update_backfill_job.call_args_list[-1].kwargs.get("failure_reason")


def test_principle_v_data_path_builds_only_market_data_client(monkeypatch):
    """Adding Alpaca must not open a live-trading path (constitution V)."""
    monkeypatch.setenv("ALPACA_API_KEY", "k")
    monkeypatch.setenv("ALPACA_SECRET_KEY", "s")

    import alpaca.data.historical as hist
    import alpaca.trading.client as trading

    built = {"data": False}

    class StubData:
        def __init__(self, *a, **k):
            built["data"] = True

    def boom(*a, **k):
        raise AssertionError("Principle V violated: trading client built on data path")

    monkeypatch.setattr(hist, "StockHistoricalDataClient", StubData)
    monkeypatch.setattr(trading, "TradingClient", boom)

    from intraday_trade_spy.data.alpaca_source import AlpacaBarSource

    client = AlpacaBarSource()._build_client()
    assert built["data"] is True
    assert client is not None
