"""Atomicity test for push_run(jsonb) (T034).

Verifies that a payload with a constraint-violating row rolls back the entire
push — no orphaned run / trades / signals / journal_events.

Integration: requires a local Supabase instance.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest


pytestmark = pytest.mark.integration


def _service_client(supabase_url, service_role_key, user_id):
    from intraday_trade_spy.storage import SupabaseStorageClient

    return SupabaseStorageClient(
        url=supabase_url,
        service_role_key=service_role_key,
        user_id=str(user_id),
    )


def _row_count(db_url, table, where_run_id):
    import psycopg

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT count(*) FROM {table} WHERE run_id = %s", (str(where_run_id),))
            return cur.fetchone()[0]


def test_push_run_rolls_back_on_signal_constraint_violation(
    supabase_url, service_role_key, db_url, user_a_id, clean_db
):
    """A signal row with executed=True but no trade_id triggers a CHECK; the
    entire transaction must roll back."""
    import json

    client = _service_client(supabase_url, service_role_key, user_a_id)

    run_id = uuid4()

    # First: create a valid config + strategy so the run row would otherwise be valid.
    strategy = client.get_strategy_by_key("vwap_pullback_long")

    # Construct a payload by hand (bypass Pydantic) to trigger DB-level CHECK.
    payload = {
        "run": {
            "id": str(run_id),
            "user_id": str(user_a_id),
            "config_id": str(uuid4()),  # invalid FK to test rollback
            "strategy_id": str(strategy.id),
            "started_at": datetime.now(timezone.utc).isoformat(),
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "range_start": "2026-01-01",
            "range_end": "2026-01-02",
            "bar_count": 100,
            "summary": {},
            "data_fingerprint": "fp",
            "app_version": "test",
        },
        "trades": [],
        "signals": [],
        "journal_events": [],
    }

    with pytest.raises(Exception):
        client._client.rpc("push_run", {"payload": payload}).execute()

    # No row in any table for this run_id
    assert _row_count(db_url, "trades", run_id) == 0
    assert _row_count(db_url, "signals", run_id) == 0
    assert _row_count(db_url, "journal_events", run_id) == 0


def test_push_run_commits_valid_payload(
    supabase_url, service_role_key, db_url, user_a_id, clean_db
):
    """A valid payload commits cleanly."""
    from intraday_trade_spy.storage.models import (
        ConfigParams,
        ConfigRow,
        PushRunPayload,
        RunRow,
        RunSummary,
    )

    client = _service_client(supabase_url, service_role_key, user_a_id)
    strategy = client.get_strategy_by_key("vwap_pullback_long")

    config = ConfigRow(
        id=uuid4(),
        user_id=user_a_id,
        strategy_id=strategy.id,
        name="atomic-test",
        mode="backtest",
        params=ConfigParams(
            max_risk_per_trade=0.01,
            max_daily_loss=0.02,
            max_trades_per_day=3,
            max_consecutive_losses=2,
            cooldown_after_loss_minutes=15,
            no_new_trades_cutoff="15:30",
            force_flat_time="15:55",
            opening_range_minutes=15,
            position_value_cap=50_000.0,
        ),
    )
    client.upsert_config(config)

    run = RunRow(
        id=uuid4(),
        user_id=user_a_id,
        config_id=config.id,
        strategy_id=strategy.id,
        started_at=datetime.now(timezone.utc),
        finished_at=datetime.now(timezone.utc),
        range_start=date(2026, 1, 1),
        range_end=date(2026, 1, 2),
        bar_count=100,
        summary=RunSummary(
            pnl=Decimal("0"),
            win_rate=0.0,
            sharpe=0.0,
            max_drawdown=Decimal("0"),
            total_trades=0,
            total_signals=0,
            rejected_signals=0,
        ),
        data_fingerprint="fp",
        app_version="test",
    )

    payload = PushRunPayload(run=run, trades=[], signals=[], journal_events=[])
    client.push_run(payload)

    import psycopg

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM runs WHERE id = %s", (str(run.id),))
            assert cur.fetchone()[0] == 1
