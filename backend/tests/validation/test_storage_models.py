"""T013 — storage row models for the validation engine (Feature 011).

Pure Pydantic boundary models mirroring migrations 0110/0111/0112. No DB
needed — validates the typed boundary the storage client will (de)serialize.
"""

from datetime import date, datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from intraday_trade_spy.storage.models import (
    LockboxLedgerRow,
    RunRow,
    RunSummary,
    ValidationStudyRow,
)


def _summary() -> RunSummary:
    return RunSummary(
        pnl=0, win_rate=0.5, sharpe=0.0, max_drawdown=0,
        total_trades=0, total_signals=0, rejected_signals=0,
    )


def test_validation_study_row_defaults():
    s = ValidationStudyRow(id=uuid4(), user_id=uuid4(), kind="walk_forward")
    assert s.status == "queued"
    assert s.progress_completed == 0 and s.progress_total == 0
    assert s.result is None
    assert isinstance(s.params, dict)


def test_validation_study_kind_constrained():
    # Lockbox is NOT a study kind (analyze finding I1).
    with pytest.raises(ValidationError):
        ValidationStudyRow(id=uuid4(), user_id=uuid4(), kind="lockbox")


def test_run_row_study_fields_optional_and_default_null():
    run = RunRow(
        id=uuid4(), user_id=uuid4(), config_id=uuid4(), strategy_id=uuid4(),
        started_at=datetime.now(timezone.utc), finished_at=datetime.now(timezone.utc),
        range_start=date(2020, 1, 1), range_end=date(2020, 6, 30), bar_count=100,
        summary=_summary(), data_fingerprint="abc", app_version="test",
    )
    # Standalone run: study fields default to None.
    assert run.study_id is None and run.segment is None and run.window_index is None


def test_run_row_accepts_study_tags():
    run = RunRow(
        id=uuid4(), user_id=uuid4(), config_id=uuid4(), strategy_id=uuid4(),
        started_at=datetime.now(timezone.utc), finished_at=datetime.now(timezone.utc),
        range_start=date(2020, 1, 1), range_end=date(2020, 6, 30), bar_count=100,
        summary=_summary(), data_fingerprint="abc", app_version="test",
        study_id=uuid4(), segment="train", window_index=0,
    )
    assert run.segment == "train" and run.window_index == 0


def test_lockbox_ledger_row():
    row = LockboxLedgerRow(
        id=uuid4(), user_id=uuid4(),
        lockbox_start=date(2025, 1, 1), lockbox_end=date(2026, 12, 31),
        config_fingerprint="deadbeef", run_id=uuid4(), result={}, state="spent",
    )
    assert row.override is False
    with pytest.raises(ValidationError):
        LockboxLedgerRow(
            id=uuid4(), user_id=uuid4(),
            lockbox_start=date(2025, 1, 1), lockbox_end=date(2026, 12, 31),
            config_fingerprint="x", run_id=uuid4(), result={}, state="nonsense",
        )
