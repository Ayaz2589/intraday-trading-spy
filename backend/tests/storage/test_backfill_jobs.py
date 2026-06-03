"""Feature 009 — backfill_jobs storage methods (TDD, constitution IV)."""

from __future__ import annotations

from unittest import mock
from uuid import uuid4

import pytest


def _make_client(response):
    """A chainable fake PostgREST query whose .execute() returns `response`."""
    q = mock.MagicMock()
    for m in ["insert", "update", "select", "eq", "in_", "gte", "limit", "order"]:
        getattr(q, m).return_value = q
    q.execute.return_value = response
    client = mock.MagicMock()
    client.table.return_value = q
    return client, q


def _client_with(response):
    from intraday_trade_spy.storage import SupabaseStorageClient

    fake_client, q = _make_client(response)
    with mock.patch(
        "intraday_trade_spy.storage.client.create_client", return_value=fake_client
    ):
        c = SupabaseStorageClient(
            url="https://test.supabase.co",
            service_role_key="fake",
            user_id="11111111-1111-1111-1111-111111111111",
        )
    return c, q


def test_insert_backfill_job_returns_id_and_writes_fields():
    job_id = uuid4()
    c, q = _client_with(mock.MagicMock(data=[{"id": str(job_id)}], count=None))
    out = c.insert_backfill_job(
        job_id=job_id, range_start="2018-01-01", range_end="2026-06-01",
        source="alpaca", windows_total=42,
    )
    assert out == str(job_id)
    body = q.insert.call_args.args[0]
    assert body["id"] == str(job_id)
    assert body["user_id"] == "11111111-1111-1111-1111-111111111111"
    assert body["status"] == "queued"
    assert body["source"] == "alpaca"
    assert body["range_start"] == "2018-01-01"
    assert body["range_end"] == "2026-06-01"
    assert body["windows_total"] == 42


def test_update_backfill_job_sets_progress_and_updated_at():
    c, q = _client_with(mock.MagicMock(data=[], count=None))
    c.update_backfill_job(
        job_id=uuid4(), status="running", windows_done=3, bars_added=1500,
        gap_session_dates=["2018-07-03"],
    )
    body = q.update.call_args.args[0]
    assert body["status"] == "running"
    assert body["windows_done"] == 3
    assert body["bars_added"] == 1500
    assert body["gap_session_dates"] == ["2018-07-03"]
    assert "updated_at" in body  # always bumped


def test_get_backfill_job_found_and_missing():
    job_id = uuid4()
    c, q = _client_with(mock.MagicMock(data=[{"id": str(job_id), "status": "running"}], count=None))
    got = c.get_backfill_job(job_id=job_id, user_id=c.user_id)
    assert got["status"] == "running"

    c2, q2 = _client_with(mock.MagicMock(data=[], count=None))
    assert c2.get_backfill_job(job_id=uuid4(), user_id=c2.user_id) is None


def test_count_active_backfills_filters_status_and_excludes_stale():
    c, q = _client_with(mock.MagicMock(data=[], count=2))
    n = c.count_active_backfills(user_id=c.user_id, stale_after_minutes=60)
    assert n == 2
    # C1: only queued/running, AND not stale (updated_at >= cutoff)
    in_args = q.in_.call_args.args
    assert in_args[0] == "status"
    assert set(in_args[1]) == {"queued", "running"}
    gte_args = q.gte.call_args.args
    assert gte_args[0] == "updated_at"  # cutoff applied server-side
