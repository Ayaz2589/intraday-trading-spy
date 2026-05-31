"""Strategy registry lifecycle (FR-011 — covers analyze finding C2).

Verifies that:
  1. Disabling a strategy (UPDATE strategies SET enabled = FALSE) leaves
     existing runs/configs/trades/signals that reference it queryable.
  2. Inserting a NEW strategy row doesn't invalidate any existing rows.

This protects future additions to the registry from accidentally orphaning
historical research.
"""

from __future__ import annotations

from uuid import uuid4

import pytest


pytestmark = pytest.mark.integration


def _exec(db_url: str, sql: str, params: tuple = ()) -> list[tuple]:
    import psycopg

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            if cur.description:
                rows = cur.fetchall()
            else:
                rows = []
        conn.commit()
    return rows


def _seed_run(db_url: str, user_id, strategy_key: str = "vwap_pullback_long"):
    """Insert a minimal config + run referencing the given strategy.

    Returns the run_id.
    """
    config_id = uuid4()
    run_id = uuid4()
    strategy_id_rows = _exec(db_url, "SELECT id FROM strategies WHERE key = %s", (strategy_key,))
    assert strategy_id_rows, f"strategy {strategy_key} not seeded"
    strategy_id = strategy_id_rows[0][0]

    _exec(
        db_url,
        """
        INSERT INTO configs (id, user_id, strategy_id, name, mode, params)
        VALUES (%s, %s, %s, 'lifecycle-test', 'backtest', '{}'::jsonb)
        """,
        (str(config_id), str(user_id), str(strategy_id)),
    )
    _exec(
        db_url,
        """
        INSERT INTO runs (id, user_id, config_id, strategy_id, started_at, finished_at,
                          range_start, range_end, bar_count, summary, data_fingerprint, app_version)
        VALUES (%s, %s, %s, %s, now(), now(),
                '2026-01-01', '2026-01-02', 100, '{}'::jsonb, 'fp', 'test')
        """,
        (str(run_id), str(user_id), str(config_id), str(strategy_id)),
    )
    return run_id


def test_disabling_strategy_leaves_runs_queryable(db_url, user_a_id, clean_db):
    """FR-011: a strategy can be disabled without invalidating existing runs."""
    run_id = _seed_run(db_url, user_a_id, "vwap_pullback_long")

    # Disable the strategy
    _exec(db_url, "UPDATE strategies SET enabled = FALSE WHERE key = 'vwap_pullback_long'")

    # Existing run is still queryable + joined to the strategy row
    rows = _exec(
        db_url,
        """
        SELECT r.id, s.key, s.enabled
          FROM runs r
          JOIN strategies s ON s.id = r.strategy_id
         WHERE r.id = %s
        """,
        (str(run_id),),
    )
    assert len(rows) == 1
    assert rows[0][1] == "vwap_pullback_long"
    assert rows[0][2] is False, "strategy should be marked disabled"

    # Restore for other tests
    _exec(db_url, "UPDATE strategies SET enabled = TRUE WHERE key = 'vwap_pullback_long'")


def test_inserting_new_strategy_does_not_invalidate_existing_runs(db_url, user_a_id, clean_db):
    """FR-011: adding a new strategy row is purely additive."""
    run_id = _seed_run(db_url, user_a_id, "vwap_pullback_long")

    # Snapshot existing run count
    before_rows = _exec(db_url, "SELECT count(*) FROM runs WHERE id = %s", (str(run_id),))
    assert before_rows[0][0] == 1

    # Insert a new (hypothetical future) strategy — must satisfy v1 CHECKs (SPY, LONG, rule_based)
    new_strategy_id = uuid4()
    _exec(
        db_url,
        """
        INSERT INTO strategies (id, key, display_name, description, symbol, direction, kind)
        VALUES (%s, 'opening_breakout_long_test_only', 'Opening Breakout (test)',
                'Synthetic registry addition for lifecycle test.',
                'SPY', 'LONG', 'rule_based')
        ON CONFLICT (key) DO NOTHING
        """,
        (str(new_strategy_id),),
    )

    # Original run is still queryable and unchanged
    after_rows = _exec(
        db_url,
        "SELECT id, strategy_id FROM runs WHERE id = %s",
        (str(run_id),),
    )
    assert len(after_rows) == 1

    # Cleanup: remove the synthetic strategy
    _exec(db_url, "DELETE FROM strategies WHERE key = 'opening_breakout_long_test_only'")
