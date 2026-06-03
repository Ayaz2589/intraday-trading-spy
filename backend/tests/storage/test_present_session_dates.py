"""Feature 009 US3 — bars_present_session_dates psycopg aggregate (TDD)."""

from __future__ import annotations

from datetime import date
from unittest import mock

import pytest


def _client():
    from intraday_trade_spy.storage import SupabaseStorageClient

    with mock.patch("intraday_trade_spy.storage.client.create_client", return_value=mock.MagicMock()):
        return SupabaseStorageClient(
            url="https://t.co", service_role_key="k",
            user_id="11111111-1111-1111-1111-111111111111",
        )


def test_present_session_dates_runs_distinct_date_query(monkeypatch):
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://x")

    captured = {}

    class FakeCursor:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def execute(self, sql, params):
            captured["sql"] = sql
            captured["params"] = params
        def fetchall(self):
            return [(date(2022, 1, 3),), (date(2022, 1, 4),)]

    class FakeConn:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def cursor(self): return FakeCursor()

    import psycopg

    monkeypatch.setattr(psycopg, "connect", lambda dsn: FakeConn())

    c = _client()
    out = c.bars_present_session_dates(range_start="2022-01-01", range_end="2022-12-31")
    assert out == ["2022-01-03", "2022-01-04"]
    # Distinct ET date aggregate, range filter applied.
    assert "distinct" in captured["sql"].lower()
    assert "america/new_york" in captured["sql"].lower()


def test_present_session_dates_requires_db_url(monkeypatch):
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)
    from intraday_trade_spy.storage import CloudPushError

    c = _client()
    with pytest.raises(CloudPushError):
        c.bars_present_session_dates(range_start="2022-01-01", range_end="2022-12-31")
