"""Pydantic model tests: SignalRow, SignalIndicatorContext, JournalEventRow,
JournalEventDetails, BarRow (T026).
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest


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


def test_signal_executed_requires_trade_id():
    """XOR invariant: executed=True ⇒ trade_id NOT NULL, rejection_reason NULL."""
    from intraday_trade_spy.storage.models import SignalRow

    with pytest.raises(ValueError):
        SignalRow(
            id=uuid4(),
            run_id=uuid4(),
            user_id=uuid4(),
            emitted_at=datetime.now(timezone.utc),
            direction="LONG",
            entry_price=Decimal("500.0"),
            stop_price=Decimal("495.0"),
            target_price=Decimal("510.0"),
            executed=True,
            rejection_reason=None,
            trade_id=None,  # missing!
            indicator_context=_ctx(),
            reason_text="VWAP pullback confirmed",
        )


def test_signal_rejected_requires_rejection_reason():
    """XOR invariant: executed=False ⇒ rejection_reason NOT NULL, trade_id NULL."""
    from intraday_trade_spy.storage.models import SignalRow

    with pytest.raises(ValueError):
        SignalRow(
            id=uuid4(),
            run_id=uuid4(),
            user_id=uuid4(),
            emitted_at=datetime.now(timezone.utc),
            direction="LONG",
            entry_price=Decimal("500.0"),
            stop_price=Decimal("495.0"),
            target_price=Decimal("510.0"),
            executed=False,
            rejection_reason=None,  # missing!
            trade_id=None,
            indicator_context=_ctx(),
            reason_text="...",
        )


def test_signal_rejected_with_trade_id_raises():
    from intraday_trade_spy.storage.models import SignalRow

    with pytest.raises(ValueError):
        SignalRow(
            id=uuid4(),
            run_id=uuid4(),
            user_id=uuid4(),
            emitted_at=datetime.now(timezone.utc),
            direction="LONG",
            entry_price=Decimal("500.0"),
            stop_price=None,
            target_price=Decimal("510.0"),
            executed=False,
            rejection_reason="missing_stop",
            trade_id=uuid4(),  # nonsense
            indicator_context=_ctx(),
            reason_text="...",
        )


def test_signal_rejection_reason_must_be_known():
    from intraday_trade_spy.storage.models import SignalRow

    with pytest.raises(ValueError):
        SignalRow(
            id=uuid4(),
            run_id=uuid4(),
            user_id=uuid4(),
            emitted_at=datetime.now(timezone.utc),
            direction="LONG",
            entry_price=Decimal("500.0"),
            stop_price=Decimal("495.0"),
            target_price=Decimal("510.0"),
            executed=False,
            rejection_reason="vibes_were_off",  # not in CHECK list
            trade_id=None,
            indicator_context=_ctx(),
            reason_text="...",
        )


def test_journal_event_kind_constrained():
    from intraday_trade_spy.storage.models import JournalEventRow, JournalEventDetails

    with pytest.raises(ValueError):
        JournalEventRow(
            id=uuid4(),
            run_id=uuid4(),
            user_id=uuid4(),
            occurred_at=datetime.now(timezone.utc),
            kind="surprise_party",
            severity="info",
            message="...",
            details=JournalEventDetails(),
        )


def test_journal_event_severity_constrained():
    from intraday_trade_spy.storage.models import JournalEventRow, JournalEventDetails

    with pytest.raises(ValueError):
        JournalEventRow(
            id=uuid4(),
            run_id=uuid4(),
            user_id=uuid4(),
            occurred_at=datetime.now(timezone.utc),
            kind="lifecycle",
            severity="catastrophic",
            message="...",
            details=JournalEventDetails(),
        )


def test_bar_row_rejects_negative_volume():
    from intraday_trade_spy.storage.models import BarRow

    with pytest.raises(ValueError):
        BarRow(
            id=uuid4(),
            bar_start=datetime.now(timezone.utc),
            open=Decimal("500.0"),
            high=Decimal("501.0"),
            low=Decimal("499.0"),
            close=Decimal("500.5"),
            volume=-1,
        )


def test_bar_row_accepts_zero_volume():
    from intraday_trade_spy.storage.models import BarRow

    row = BarRow(
        id=uuid4(),
        bar_start=datetime.now(timezone.utc),
        open=Decimal("500.0"),
        high=Decimal("501.0"),
        low=Decimal("499.0"),
        close=Decimal("500.5"),
        volume=0,
    )
    assert row.volume == 0
