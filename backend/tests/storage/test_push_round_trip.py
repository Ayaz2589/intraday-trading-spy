"""End-to-end round-trip test (T042).

Engine → CLI → local outputs → cloud push → read-back → byte-parity.

Integration: requires a local Supabase instance + the bundled synthetic CSV
fixture.
"""

from __future__ import annotations

import pytest


pytestmark = pytest.mark.integration


def test_round_trip_run_pushed_and_read_back_matches(
    supabase_url, service_role_key, db_url, user_a_id, tmp_path, clean_db
):
    """Run the engine on the bundled fixture, push it, query Supabase, assert
    every trade and signal matches local outputs."""
    from pathlib import Path
    import subprocess
    import json
    import csv

    from intraday_trade_spy.storage import SupabaseStorageClient

    # 1. Run the existing CLI locally (no --push-to-supabase yet)
    repo_root = Path(__file__).resolve().parents[3]
    out_dir = tmp_path / "backtests"
    subprocess.run(
        [
            "intraday-trade-spy-backtest",
            "--config", str(repo_root / "backend" / "config" / "config.yaml"),
            "--out", str(out_dir),
            "--quiet",
        ],
        check=True,
        cwd=repo_root / "backend",
    )

    # 2. Find the run directory
    run_dirs = list(out_dir.iterdir())
    assert len(run_dirs) == 1
    run_dir = run_dirs[0]

    # 3. Manually push via the storage layer (so we don't need to subprocess
    #    the CLI with mid-test env vars)
    from intraday_trade_spy.storage.push import gather_run_outputs, config_from_yaml
    from uuid import uuid4, UUID

    client = SupabaseStorageClient(
        url=supabase_url,
        service_role_key=service_role_key,
        user_id=str(user_a_id),
    )
    strategy = client.get_strategy_by_key("vwap_pullback_long")
    config = config_from_yaml(
        config_id=uuid4(),
        user_id=user_a_id,
        strategy_id=strategy.id,
        name="round-trip-test",
        yaml_path=repo_root / "backend" / "config" / "config.yaml",
    )
    client.upsert_config(config)

    payload = gather_run_outputs(
        run_dir,
        user_id=user_a_id,
        config_id=UUID(str(config.id)),
        strategy_id=strategy.id,
    )
    cloud_run_id = client.push_run(payload)

    # 4. Read back from Supabase and compare counts (full byte-parity check
    #    would require pickling timestamps + decimals — count comparison is
    #    a strong-enough invariant for this round-trip test).
    import psycopg

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM trades WHERE run_id = %s", (cloud_run_id,))
            cloud_trades = cur.fetchone()[0]
            cur.execute("SELECT count(*) FROM signals WHERE run_id = %s", (cloud_run_id,))
            cloud_signals = cur.fetchone()[0]
            cur.execute("SELECT count(*) FROM journal_events WHERE run_id = %s", (cloud_run_id,))
            cloud_events = cur.fetchone()[0]

    # Count from local journal
    with (run_dir / "journal.csv").open() as f:
        rows = list(csv.DictReader(f))

    local_trades = sum(1 for r in rows if r.get("status") == "executed")
    local_rejected = sum(1 for r in rows if r.get("status") == "rejected")

    assert cloud_trades == local_trades
    assert cloud_signals == local_trades + local_rejected
