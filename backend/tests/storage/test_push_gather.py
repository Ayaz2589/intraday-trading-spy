"""storage.push.gather_run_outputs tests (T039).

Unit-level: builds a synthetic run_dir on disk, exercises the gather code,
asserts the resulting PushRunPayload has the expected shape.
"""

from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pytest
import yaml


def _write_minimal_run_dir(tmp_path: Path) -> Path:
    run_dir = tmp_path / "20260530-120000-abc12345"
    run_dir.mkdir(parents=True)

    started = datetime(2026, 5, 30, 12, 0, 0, tzinfo=timezone.utc)
    ended = datetime(2026, 5, 30, 12, 5, 0, tzinfo=timezone.utc)

    run_yaml = {
        "run_id": "20260530-120000-abc12345",
        "run_started_at": started.isoformat(),
        "run_ended_at": ended.isoformat(),
        "code_version": "test-sha",
        "config_snapshot": {},
        "data_fingerprint": {
            "sha256": "abc12345" * 8,
            "bar_count": 78,
            "earliest_timestamp": started.isoformat(),
            "latest_timestamp": ended.isoformat(),
            "session_count": 1,
        },
        "summary": {},
    }
    (run_dir / "run.yaml").write_text(yaml.safe_dump(run_yaml))

    summary = {
        "total_trades": 0,
        "wins": 0,
        "losses": 0,
        "win_rate": 0.0,
        "average_win_r": 0.0,
        "average_loss_r": 0.0,
        "average_r": 0.0,
        "total_r": 0.0,
        "profit_factor": None,
        "max_drawdown_r": 0.0,
        "best_trade_r": None,
        "worst_trade_r": None,
        "longest_consecutive_loss_streak": 0,
        "rejected_signal_count": 0,
        "rejection_breakdown": {},
        "total_pnl_dollars": 0.0,
    }
    (run_dir / "summary.json").write_text(json.dumps(summary))

    # Minimal journal with one rejected row + one trade pair
    with (run_dir / "journal.csv").open("w", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "row_seq", "timestamp", "status", "setup", "direction",
                "planned_entry", "stop_loss", "take_profit", "quantity",
                "planned_risk_dollars", "actual_entry", "actual_exit",
                "exit_reason", "realized_pnl", "realized_r", "vwap",
                "or_high", "or_low", "distance_from_vwap_pct",
                "prior_bar_close", "reason", "rejection_check",
                "same_bar_tiebreak",
            ],
        )
        writer.writeheader()
        writer.writerow(
            {
                "row_seq": 0,
                "timestamp": started.isoformat(),
                "status": "rejected",
                "setup": "vwap_pullback_long",
                "direction": "long",
                "planned_entry": "500.0",
                "stop_loss": "495.0",
                "take_profit": "510.0",
                "vwap": "500.5",
                "or_high": "502.0",
                "or_low": "498.0",
                "reason": "rejected for testing",
                "rejection_check": "or_incomplete",
            }
        )

    return run_dir


def test_gather_produces_payload_with_expected_shape(tmp_path):
    from intraday_trade_spy.storage.push import gather_run_outputs

    run_dir = _write_minimal_run_dir(tmp_path)

    user_id = uuid4()
    config_id = uuid4()
    strategy_id = uuid4()

    payload = gather_run_outputs(
        run_dir,
        user_id=user_id,
        config_id=config_id,
        strategy_id=strategy_id,
    )
    assert payload.run.user_id == user_id
    assert payload.run.bar_count == 78
    # One rejected signal in the synthetic journal
    assert len(payload.signals) == 1
    assert payload.signals[0].executed is False
    assert payload.signals[0].rejection_reason == "opening_range_not_complete"
    assert payload.signals[0].user_id == user_id


def test_gather_raises_on_missing_run_yaml(tmp_path):
    from intraday_trade_spy.storage.exceptions import SchemaError
    from intraday_trade_spy.storage.push import gather_run_outputs

    empty_dir = tmp_path / "empty"
    empty_dir.mkdir()

    with pytest.raises(SchemaError):
        gather_run_outputs(
            empty_dir,
            user_id=uuid4(),
            config_id=uuid4(),
            strategy_id=uuid4(),
        )
