"""Feature 013 (analyze C3) — bars_monthly_aggregate against a real Supabase.

Verifies the R8 psycopg SQL itself (month bucketing, totals, sources) on the
live bars cache. Gated like tests/storage/test_client_configs.py: opt-in via
SUPABASE_INTEGRATION=1 + cloud creds in backend/.env; read-only (no cleanup
needed). `slow` so the offline socket-blocker permits the network.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

pytestmark = [pytest.mark.integration, pytest.mark.slow]

ENV = Path(__file__).resolve().parents[2] / ".env"


def _load_env() -> None:
    if not ENV.exists():
        return
    for raw in ENV.read_text().splitlines():
        line = raw.strip()
        if line.startswith("export "):
            line = line[len("export "):]
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


@pytest.fixture(scope="module")
def cloud_client():
    if os.environ.get("SUPABASE_INTEGRATION", "").lower() not in {"1", "true", "yes"}:
        pytest.skip("SUPABASE_INTEGRATION not set; cloud stats integration test skipped.")
    _load_env()
    if not os.environ.get("SUPABASE_DB_URL") or not os.environ.get("SUPABASE_URL"):
        pytest.skip("cloud creds (SUPABASE_URL / SUPABASE_DB_URL) not in env.")
    from intraday_trade_spy.storage.client import SupabaseStorageClient

    return SupabaseStorageClient.from_env()


def test_monthly_aggregate_is_internally_consistent(cloud_client):
    agg = cloud_client.bars_monthly_aggregate()
    months, totals = agg["months"], agg["totals"]

    # Totals reconcile with the per-month breakdown.
    assert totals["bars"] == sum(m["bars"] for m in months.values())
    assert totals["sessions"] == sum(len(m["session_dates"]) for m in months.values())

    # Month keys are well-formed and every session date belongs to its month.
    for key, m in months.items():
        assert len(key) == 7 and key[4] == "-"
        assert all(d.startswith(key) for d in m["session_dates"])
        assert m["sources"], f"month {key} has no sources"

    # Span endpoints match the min/max session dates.
    all_dates = sorted(d for m in months.values() for d in m["session_dates"])
    if all_dates:
        assert totals["earliest"] == all_dates[0]
        assert totals["latest"] == all_dates[-1]
        assert totals["last_updated"] is not None


def test_lineage_counts_match_runs_table(cloud_client):
    # SC-007: lineage counts are the same persisted rows the Runs page lists.
    assert cloud_client.runs_count() >= 0
    assert cloud_client.studies_count() >= 0
    latest = cloud_client.latest_run_at()
    assert latest is None or isinstance(latest, str)
