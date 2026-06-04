"""T004/T012/T022 — Feature 013 endpoints: GET /api/bars/backfill (job history)
and GET /api/bars/stats (page snapshot). Stub-storage pattern (no Supabase)."""

from __future__ import annotations

import pytest
from freezegun import freeze_time

pytestmark = pytest.mark.api


def _job(i: int, status: str = "finished", **over) -> dict:
    row = {
        "id": f"00000000-0000-0000-0000-00000000000{i}",
        "status": status,
        "source": "alpaca",
        "range_start": "2018-01-01",
        "range_end": "2026-06-04",
        "windows_total": 103,
        "windows_done": 103 if status == "finished" else 0,
        "bars_added": 1 if status == "finished" else 0,
        "gap_session_dates": [],
        "failure_reason": None,
        "created_at": f"2026-06-04T1{i}:00:00Z",
        "updated_at": f"2026-06-04T1{i}:00:4{i}Z",
    }
    row.update(over)
    return row


# ---- T004: GET /api/bars/backfill (job history list) ----


def test_backfill_history_lists_jobs_newest_first(unit_client, stub_storage_client):
    stub_storage_client.list_backfill_jobs.return_value = [
        _job(2),
        _job(1, status="failed", failure_reason="No module named 'alpaca'"),
    ]
    resp = unit_client.get("/api/bars/backfill")
    assert resp.status_code == 200
    jobs = resp.json()["jobs"]
    assert [j["status"] for j in jobs] == ["finished", "failed"]
    # Duration material + failure reason survive the view (FR-001/FR-002).
    assert jobs[0]["created_at"] and jobs[0]["updated_at"]
    assert jobs[1]["failure_reason"] == "No module named 'alpaca'"
    # The cap comes from config (api.backfill.history_limit), not a literal.
    from intraday_trade_spy.api.lifecycle import get_backfill_history_limit

    stub_storage_client.list_backfill_jobs.assert_called_once_with(
        limit=get_backfill_history_limit()
    )


def test_backfill_history_does_not_shadow_single_job_route(unit_client, stub_storage_client):
    stub_storage_client.get_backfill_job.return_value = _job(3)
    resp = unit_client.get("/api/bars/backfill/00000000-0000-0000-0000-000000000003")
    assert resp.status_code == 200
    assert resp.json()["job_id"] == "00000000-0000-0000-0000-000000000003"


# ---- T012: GET /api/bars/stats (snapshot shape) ----

AGG = {
    "months": {
        "2026-04": {
            "bars": 1638,
            "session_dates": [f"2026-04-{d:02d}" for d in (1, 2, 3, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 20, 21, 22, 23, 24, 27, 28, 29, 30)],
            "sources": ["alpaca"],
        },
    },
    "totals": {
        "bars": 1638,
        "sessions": 22,
        "earliest": "2026-04-01",
        "latest": "2026-04-30",
        "last_updated": "2026-06-04T15:02:11Z",
        "sources": ["alpaca"],
    },
}


@freeze_time("2026-06-04 12:00:00-04:00")
def test_stats_returns_totals_months_lineage(unit_client, stub_storage_client):
    stub_storage_client.bars_monthly_aggregate.return_value = AGG
    stub_storage_client.runs_count.return_value = 47
    stub_storage_client.studies_count.return_value = 14
    stub_storage_client.latest_run_at.return_value = "2026-06-04T14:11:09Z"

    resp = unit_client.get("/api/bars/stats")
    assert resp.status_code == 200
    body = resp.json()

    assert body["totals"]["bars"] == 1638
    assert body["totals"]["sources"] == ["alpaca"]
    months = {m["month"]: m for m in body["months"]}
    # April fully cached -> complete; May after latest -> future; June = current.
    assert months["2026-04"]["state"] == "complete"
    assert months["2026-04"]["missing_dates"] == []
    assert months["2026-05"]["state"] == "future"
    assert months["2026-06"]["state"] == "current"
    assert body["months"][0]["month"] == "2026-04"  # ascending

    # T022: lineage carried through.
    assert body["lineage"] == {
        "runs_count": 47,
        "studies_count": 14,
        "latest_run_at": "2026-06-04T14:11:09Z",
    }


@freeze_time("2026-06-04 12:00:00-04:00")
def test_stats_degrades_when_aggregate_fails(unit_client, stub_storage_client):
    # FR-011: storage trouble must degrade the snapshot, never 500.
    stub_storage_client.bars_monthly_aggregate.side_effect = RuntimeError("db down")
    stub_storage_client.runs_count.side_effect = RuntimeError("db down")
    stub_storage_client.studies_count.side_effect = RuntimeError("db down")
    stub_storage_client.latest_run_at.side_effect = RuntimeError("db down")

    resp = unit_client.get("/api/bars/stats")
    assert resp.status_code == 200
    body = resp.json()
    assert body["months"] == []
    assert body["totals"]["bars"] == 0 and body["totals"]["earliest"] is None
    assert body["lineage"]["runs_count"] == 0 and body["lineage"]["latest_run_at"] is None


@freeze_time("2026-06-04 12:00:00-04:00")
def test_stats_consults_the_calendar_once_per_request(unit_client, stub_storage_client, monkeypatch):
    # Perf (SC-005): the route must prefetch the whole span's expected sessions
    # in ONE calendar call and slice per month — not one call per month
    # (102 calls × ~100ms was the ~10s Data-page load).
    from intraday_trade_spy.data import market_calendar

    calls = []
    real = market_calendar.expected_session_dates

    def counting(start, end, **kw):
        calls.append((start, end))
        return real(start, end, **kw)

    monkeypatch.setattr(market_calendar, "expected_session_dates", counting)
    stub_storage_client.bars_monthly_aggregate.return_value = AGG
    stub_storage_client.runs_count.return_value = 0
    stub_storage_client.studies_count.return_value = 0
    stub_storage_client.latest_run_at.return_value = None

    resp = unit_client.get("/api/bars/stats")
    assert resp.status_code == 200
    assert len(resp.json()["months"]) == 3  # Apr complete, May future, Jun current
    assert len(calls) == 1, f"expected one span-wide calendar call, got {len(calls)}"


@freeze_time("2026-06-04 12:00:00-04:00")
def test_stats_empty_cache_yields_empty_months(unit_client, stub_storage_client):
    stub_storage_client.bars_monthly_aggregate.return_value = {
        "months": {},
        "totals": {"bars": 0, "sessions": 0, "earliest": None, "latest": None, "last_updated": None, "sources": []},
    }
    stub_storage_client.runs_count.return_value = 0
    stub_storage_client.studies_count.return_value = 0
    stub_storage_client.latest_run_at.return_value = None

    resp = unit_client.get("/api/bars/stats")
    assert resp.status_code == 200
    assert resp.json()["months"] == []
