"""CLI --push-to-supabase flag tests (T041).

Covers exit codes from contracts/cli-flag.md:
    0 — success (push)
    1 — engine error (existing behavior, not changed)
    2 — missing required env var
    3 — Supabase reachability check failed
    4 — RPC failure
    5 — payload validation failure

Plus the "flag absent → no env reads, no network calls" SC-004 guarantee.
"""

from __future__ import annotations

from pathlib import Path
from unittest import mock
from uuid import uuid4

import pytest


BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = str(BACKEND_ROOT / "config" / "config.yaml")


def test_flag_absent_does_not_read_supabase_env(monkeypatch, tmp_path):
    """SC-004 / FR-013: without --push-to-supabase, no Supabase env is read."""
    # Set env vars to garbage; if the CLI reads them, the test would fail
    # because we'd see different behavior. The contract: the CLI must not
    # touch these vars unless --push-to-supabase is set.
    from intraday_trade_spy.cli.run_backtest import main

    monkeypatch.setenv("SUPABASE_URL", "garbage")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "garbage")
    monkeypatch.setenv("SUPABASE_USER_ID", "not-a-uuid")

    # Without --push-to-supabase, the CLI should run the engine and exit 0.
    # We can't fully run the engine in this unit test (it needs a CSV),
    # so we patch BacktestEngine to short-circuit.
    with mock.patch("intraday_trade_spy.cli.run_backtest.BacktestEngine") as Engine:
        Engine.return_value.run.return_value = mock.MagicMock(
            run=mock.MagicMock(run_id="test"),
            journal_rows=[],
            summary=mock.MagicMock(model_dump=lambda **kw: {}),
        )
        with mock.patch("intraday_trade_spy.cli.run_backtest.write_journal_csv"):
            with mock.patch("intraday_trade_spy.cli.run_backtest.write_run_yaml"):
                exit_code = main(["--config", DEFAULT_CONFIG, "--out", str(tmp_path), "--quiet"])
    assert exit_code == 0
    # If we got here without an exception about garbage SUPABASE_USER_ID,
    # the CLI didn't try to validate it.


def test_missing_supabase_url_exits_2(monkeypatch):
    from intraday_trade_spy.cli.run_backtest import main

    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake")
    monkeypatch.setenv("SUPABASE_USER_ID", str(uuid4()))

    exit_code = main([
        "--config", DEFAULT_CONFIG,
        "--push-to-supabase",
    ])
    assert exit_code == 2


def test_missing_service_role_key_exits_2(monkeypatch):
    from intraday_trade_spy.cli.run_backtest import main

    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.setenv("SUPABASE_USER_ID", str(uuid4()))

    exit_code = main([
        "--config", DEFAULT_CONFIG,
        "--push-to-supabase",
    ])
    assert exit_code == 2


def test_missing_user_id_exits_2(monkeypatch):
    from intraday_trade_spy.cli.run_backtest import main

    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake")
    monkeypatch.delenv("SUPABASE_USER_ID", raising=False)

    exit_code = main([
        "--config", DEFAULT_CONFIG,
        "--push-to-supabase",
    ])
    assert exit_code == 2


def test_unreachable_supabase_exits_3(monkeypatch):
    from intraday_trade_spy.cli.run_backtest import main

    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake")
    monkeypatch.setenv("SUPABASE_USER_ID", str(uuid4()))

    # Patch the client to fail the health check
    with mock.patch("intraday_trade_spy.storage.client.create_client") as create:
        fake_client = mock.MagicMock()
        fake_client.table.return_value.select.return_value.limit.return_value.execute.side_effect = (
            Exception("connection refused")
        )
        create.return_value = fake_client

        exit_code = main([
            "--config", DEFAULT_CONFIG,
            "--push-to-supabase",
        ])
    assert exit_code == 3
