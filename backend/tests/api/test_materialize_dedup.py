"""Feature 009 US2 — cross-source dedup on the backtest read path (TDD)."""

from __future__ import annotations

import csv
from datetime import date
from pathlib import Path
from unittest import mock

import pytest


def _read_csv(path: Path):
    with Path(path).open() as f:
        return list(csv.DictReader(f))


def test_list_bars_psycopg_returns_all_rows_with_source(monkeypatch):
    """Bulk read uses psycopg (no 1000-row PostgREST cap) and includes source."""
    from datetime import datetime, timezone
    from decimal import Decimal

    from intraday_trade_spy.storage import SupabaseStorageClient

    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://x")
    captured = {}

    class FakeCursor:
        description = [("bar_start",), ("open",), ("high",), ("low",), ("close",), ("volume",), ("source",)]
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def execute(self, sql, params): captured["sql"] = sql; captured["params"] = params
        def fetchall(self):
            ts = datetime(2018, 1, 2, 14, 30, tzinfo=timezone.utc)
            return [
                (ts, Decimal("100.0"), Decimal("100.5"), Decimal("99.8"), Decimal("100.2"), 5000, "alpaca"),
            ]

    class FakeConn:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def cursor(self): return FakeCursor()

    import psycopg
    monkeypatch.setattr(psycopg, "connect", lambda dsn: FakeConn())

    with mock.patch("intraday_trade_spy.storage.client.create_client", return_value=mock.MagicMock()):
        c = SupabaseStorageClient(url="https://t.co", service_role_key="k", user_id="11111111-1111-1111-1111-111111111111")
    rows = c.list_bars(range_start="2018-01-01", range_end="2026-06-02")
    assert len(rows) == 1
    r = rows[0]
    assert r["source"] == "alpaca"
    assert r["bar_start"].startswith("2018-01-02T14:30")
    assert float(r["open"]) == 100.0 and r["volume"] == 5000
    assert "source" in captured["sql"].lower()


def test_list_bars_rest_fallback_paginates_beyond_1000(monkeypatch):
    """With no SUPABASE_DB_URL, fall back to PostgREST and paginate past 1000."""
    from intraday_trade_spy.storage import SupabaseStorageClient

    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)
    q = mock.MagicMock()
    for m in ["select", "gte", "lt", "order", "range"]:
        getattr(q, m).return_value = q
    page1 = [{"bar_start": f"a{i}", "source": "alpaca"} for i in range(1000)]
    page2 = [{"bar_start": f"b{i}", "source": "alpaca"} for i in range(7)]
    q.execute.side_effect = [mock.MagicMock(data=page1), mock.MagicMock(data=page2)]
    fake_client = mock.MagicMock()
    fake_client.table.return_value = q
    with mock.patch("intraday_trade_spy.storage.client.create_client", return_value=fake_client):
        c = SupabaseStorageClient(url="https://t.co", service_role_key="k", user_id="11111111-1111-1111-1111-111111111111")
    rows = c.list_bars(range_start="2018-01-01", range_end="2026-06-02")
    assert len(rows) == 1007
    assert q.range.call_count == 2
    assert "source" in q.select.call_args.args[0]


def test_materialize_dedupes_overlapping_sources_preferring_alpaca(tmp_path):
    from intraday_trade_spy.api.lifecycle import materialize_bars_csv

    stub = mock.MagicMock()
    stub.list_bars.return_value = [
        {"bar_start": "2026-06-01T09:30:00-04:00", "open": "1", "high": "1.1", "low": "0.9", "close": "1", "volume": "10", "source": "yfinance"},
        {"bar_start": "2026-06-01T09:30:00-04:00", "open": "2", "high": "2.1", "low": "1.9", "close": "2", "volume": "20", "source": "alpaca"},
        {"bar_start": "2026-06-01T09:35:00-04:00", "open": "3", "high": "3.1", "low": "2.9", "close": "3", "volume": "30", "source": "yfinance"},
    ]
    out = materialize_bars_csv(storage_client=stub, start=date(2026, 6, 1), end=date(2026, 6, 1))
    rows = _read_csv(out)
    # Exactly one bar per timestamp (no double counting).
    assert len(rows) == 2
    ts = {r["timestamp"] for r in rows}
    assert ts == {"2026-06-01T09:30:00-04:00", "2026-06-01T09:35:00-04:00"}
    # The overlapping 09:30 bar resolves to the Alpaca row (open=2), not yfinance.
    nine_thirty = [r for r in rows if r["timestamp"] == "2026-06-01T09:30:00-04:00"][0]
    assert nine_thirty["open"] == "2"
    Path(out).unlink(missing_ok=True)


def test_materialize_output_is_chronological(tmp_path):
    from intraday_trade_spy.api.lifecycle import materialize_bars_csv

    stub = mock.MagicMock()
    stub.list_bars.return_value = [
        {"bar_start": "2026-06-01T09:35:00-04:00", "open": "3", "high": "3.1", "low": "2.9", "close": "3", "volume": "30", "source": "alpaca"},
        {"bar_start": "2026-06-01T09:30:00-04:00", "open": "2", "high": "2.1", "low": "1.9", "close": "2", "volume": "20", "source": "alpaca"},
    ]
    out = materialize_bars_csv(storage_client=stub, start=date(2026, 6, 1), end=date(2026, 6, 1))
    rows = _read_csv(out)
    assert [r["timestamp"] for r in rows] == [
        "2026-06-01T09:30:00-04:00",
        "2026-06-01T09:35:00-04:00",
    ]
    Path(out).unlink(missing_ok=True)


# ---- future-dated ranges (lockbox spans into the future by design) -------------

def test_materialize_never_fetches_future_days():
    """A range ending in the future (e.g. the 2025–26 lockbox) must not try to
    download bars for days that haven't happened — DownloadRequest refuses
    future dates and the 500 would block the lockbox run entirely."""
    import freezegun

    from intraday_trade_spy.api import lifecycle as lc

    with freezegun.freeze_time("2026-06-07"):
        stub = mock.MagicMock()
        stub.list_bars.return_value = [
            {"bar_start": "2026-06-05T09:30:00-04:00", "open": "1", "high": "1.1",
             "low": "0.9", "close": "1", "volume": "10", "source": "alpaca"},
        ]
        calls = []
        with mock.patch.object(lc, "_fetch_and_cache_range",
                               side_effect=lambda **kw: calls.append(kw)):
            out = lc.materialize_bars_csv(
                storage_client=stub, start=date(2026, 6, 5), end=date(2026, 12, 31))
        assert calls == []  # nothing missing in the past — nothing to fetch
        rows = _read_csv(out)
        assert len(rows) == 1
        Path(out).unlink(missing_ok=True)


def test_materialize_clamps_fetch_to_today_when_past_days_missing():
    import freezegun

    from intraday_trade_spy.api import lifecycle as lc

    with freezegun.freeze_time("2026-06-07"):
        stub = mock.MagicMock()
        stub.list_bars.return_value = [
            {"bar_start": "2026-06-04T09:30:00-04:00", "open": "1", "high": "1.1",
             "low": "0.9", "close": "1", "volume": "10", "source": "alpaca"},
        ]
        calls = []
        with mock.patch.object(lc, "_fetch_and_cache_range",
                               side_effect=lambda **kw: calls.append(kw)):
            out = lc.materialize_bars_csv(
                storage_client=stub, start=date(2026, 6, 4), end=date(2026, 12, 31))
        # 2026-06-05 (Fri) is missing and in the past — fetched; nothing future.
        assert len(calls) == 1
        assert calls[0]["start"] == date(2026, 6, 5)
        assert calls[0]["end"] <= date(2026, 6, 7)
        Path(out).unlink(missing_ok=True)
