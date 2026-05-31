"""Pydantic test: PushRunPayload composite validation (T027).

Rolls up to row-level errors when any contained row fails validation.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest


def _run_summary():
    from intraday_trade_spy.storage.models import RunSummary

    return RunSummary(
        pnl=Decimal("0.0"),
        win_rate=0.0,
        sharpe=0.0,
        max_drawdown=Decimal("0.0"),
        total_trades=0,
        total_signals=0,
        rejected_signals=0,
    )


def _ctx():
    from intraday_trade_spy.storage.models import SignalIndicatorContext

    return SignalIndicatorContext(
        vwap=Decimal("500.0"),
        opening_range_high=Decimal("502.0"),
        opening_range_low=Decimal("498.0"),
        bar_open=Decimal("500.5"),
        bar_high=Decimal("501.0"),
        bar_low=Decimal("499.5"),
        bar_close=Decimal("500.8"),
        bar_volume=100_000,
    )


def _valid_run(user_id, config_id, strategy_id, run_id):
    from intraday_trade_spy.storage.models import RunRow

    return RunRow(
        id=run_id,
        user_id=user_id,
        config_id=config_id,
        strategy_id=strategy_id,
        started_at=datetime.now(timezone.utc),
        finished_at=datetime.now(timezone.utc),
        range_start=date(2026, 1, 1),
        range_end=date(2026, 1, 5),
        bar_count=100,
        summary=_run_summary(),
        data_fingerprint="fp",
        app_version="0.1.0",
    )


def test_push_run_payload_empty_lists_accepted():
    from intraday_trade_spy.storage.models import PushRunPayload

    user_id = uuid4()
    config_id = uuid4()
    strategy_id = uuid4()
    run_id = uuid4()

    payload = PushRunPayload(
        run=_valid_run(user_id, config_id, strategy_id, run_id),
        trades=[],
        signals=[],
        journal_events=[],
    )
    assert payload.run.id == run_id


def test_push_run_payload_rolls_up_signal_validation_failure():
    """A bad signal raises before any network call."""
    from intraday_trade_spy.storage.models import PushRunPayload, SignalRow

    user_id = uuid4()
    with pytest.raises(ValueError):
        PushRunPayload(
            run=_valid_run(user_id, uuid4(), uuid4(), uuid4()),
            trades=[],
            signals=[
                SignalRow(
                    id=uuid4(),
                    run_id=uuid4(),
                    user_id=user_id,
                    emitted_at=datetime.now(timezone.utc),
                    direction="LONG",
                    entry_price=Decimal("500.0"),
                    stop_price=Decimal("495.0"),
                    target_price=Decimal("510.0"),
                    executed=True,
                    rejection_reason=None,
                    trade_id=None,  # invalid: executed without trade_id
                    indicator_context=_ctx(),
                    reason_text="...",
                )
            ],
            journal_events=[],
        )


def test_push_run_payload_user_id_consistency():
    """All rows in the payload must share the run's user_id."""
    from intraday_trade_spy.storage.models import (
        PushRunPayload,
        JournalEventRow,
        JournalEventDetails,
    )

    user_id = uuid4()
    other_user = uuid4()

    with pytest.raises(ValueError):
        PushRunPayload(
            run=_valid_run(user_id, uuid4(), uuid4(), uuid4()),
            trades=[],
            signals=[],
            journal_events=[
                JournalEventRow(
                    id=uuid4(),
                    run_id=uuid4(),
                    user_id=other_user,  # mismatch
                    occurred_at=datetime.now(timezone.utc),
                    kind="lifecycle",
                    severity="info",
                    message="...",
                    details=JournalEventDetails(),
                )
            ],
        )
