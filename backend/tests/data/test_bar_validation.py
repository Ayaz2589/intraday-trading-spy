"""Feature 009 US2 — shared bar validation (TDD, constitution IV)."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from intraday_trade_spy.data.validation import (
    in_regular_session,
    ohlc_is_sane,
    partition_valid_rows,
    validate_bar_row,
)

ET = ZoneInfo("America/New_York")


def _et(h, m):
    return datetime(2026, 6, 1, h, m, tzinfo=ET)


def test_in_regular_session_boundaries():
    assert in_regular_session(_et(9, 30)) is True
    assert in_regular_session(_et(15, 55)) is True
    assert in_regular_session(_et(9, 29)) is False
    assert in_regular_session(_et(16, 0)) is False  # end-exclusive
    assert in_regular_session(_et(16, 5)) is False


def test_ohlc_is_sane():
    assert ohlc_is_sane(100, 101, 99, 100.5) is True
    assert ohlc_is_sane(100, 99, 101, 100) is False   # high < low
    assert ohlc_is_sane(-1, 1, -2, 0) is False        # non-positive
    assert ohlc_is_sane(100, 100.2, 99, 100.5) is False  # high < close
    assert ohlc_is_sane(100, 101, 100.5, 100.2) is False  # low > open


def _row(ts, o=100, h=101, l=99, c=100, v=1000, source="alpaca"):
    return {"bar_start": ts, "open": o, "high": h, "low": l, "close": c, "volume": v, "source": source}


def test_validate_bar_row():
    assert validate_bar_row(_row("2026-06-01T09:35:00-04:00")) is True
    assert validate_bar_row(_row("2026-06-01T08:00:00-04:00")) is False   # pre-market
    assert validate_bar_row(_row("2026-06-01T09:35:00-04:00", v=0)) is False  # zero vol
    assert validate_bar_row(_row("2026-06-01T09:35:00-04:00", h=1, l=100)) is False  # insane
    assert validate_bar_row(_row("not-a-timestamp")) is False


def test_partition_valid_rows_counts_rejects():
    rows = [
        _row("2026-06-01T09:35:00-04:00"),               # valid
        _row("2026-06-01T08:00:00-04:00"),               # pre-market reject
        _row("2026-06-01T09:40:00-04:00", v=0),          # zero-vol reject
        _row("2026-06-01T09:45:00-04:00"),               # valid
    ]
    valid, rejected = partition_valid_rows(rows)
    assert len(valid) == 2
    assert rejected == 2
