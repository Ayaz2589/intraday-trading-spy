"""Feature 009 US2 — backfill idempotency (TDD).

Re-running a backfill over an already-cached range adds ~0 bars, because
upsert_bars is ON CONFLICT DO NOTHING. Here we simulate that conflict
behavior and assert the second pass reports zero new bars.
"""

from __future__ import annotations

from datetime import date
from unittest import mock
from uuid import uuid4

from intraday_trade_spy.api.lifecycle import _run_backfill_task


class FixedSource:
    name = "alpaca"

    def __init__(self, rows):
        self._rows = rows

    def fetch_rows(self, *, start, end, symbol="SPY", timeframe="5m"):
        return list(self._rows)


def _final_bars_added(stub):
    return stub.update_backfill_job.call_args_list[-1].kwargs["bars_added"]


def test_rerun_over_cached_range_adds_zero():
    cached: set[str] = set()

    def upsert(rows):
        new = [r for r in rows if r["bar_start"] not in cached]
        cached.update(r["bar_start"] for r in rows)
        return len(new)

    rows = [
        {"bar_start": "2026-06-01T09:30:00-04:00", "open": 1, "high": 1.1, "low": 0.9, "close": 1, "volume": 1, "source": "alpaca"},
        {"bar_start": "2026-06-01T09:35:00-04:00", "open": 1, "high": 1.1, "low": 0.9, "close": 1, "volume": 1, "source": "alpaca"},
    ]
    src = FixedSource(rows)

    stub1 = mock.MagicMock()
    stub1.upsert_bars.side_effect = upsert
    _run_backfill_task(
        job_id=uuid4(), user_id=uuid4(), start_date=date(2026, 6, 1),
        end_date=date(2026, 6, 1), source="alpaca", storage_client=stub1, bar_source=src,
    )
    assert _final_bars_added(stub1) == 2  # first pass caches both

    stub2 = mock.MagicMock()
    stub2.upsert_bars.side_effect = upsert
    _run_backfill_task(
        job_id=uuid4(), user_id=uuid4(), start_date=date(2026, 6, 1),
        end_date=date(2026, 6, 1), source="alpaca", storage_client=stub2, bar_source=src,
    )
    assert _final_bars_added(stub2) == 0  # second pass adds nothing (idempotent)
