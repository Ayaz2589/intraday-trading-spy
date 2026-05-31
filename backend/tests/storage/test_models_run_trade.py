"""Pydantic model tests: RunRow, RunSummary, TradeRow (T025)."""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest


def test_run_summary_accepts_complete_metrics():
    from intraday_trade_spy.storage.models import RunSummary

    summary = RunSummary(
        pnl=Decimal("123.45"),
        win_rate=0.6,
        sharpe=1.5,
        max_drawdown=Decimal("-50.00"),
        total_trades=10,
        total_signals=42,
        rejected_signals=32,
    )
    assert summary.total_trades == 10


def test_run_row_requires_range_end_gte_start():
    from intraday_trade_spy.storage.models import RunRow, RunSummary

    summary = RunSummary(
        pnl=Decimal("0.0"),
        win_rate=0.0,
        sharpe=0.0,
        max_drawdown=Decimal("0.0"),
        total_trades=0,
        total_signals=0,
        rejected_signals=0,
    )
    with pytest.raises(ValueError):
        RunRow(
            id=uuid4(),
            user_id=uuid4(),
            config_id=uuid4(),
            strategy_id=uuid4(),
            started_at=datetime.now(timezone.utc),
            finished_at=datetime.now(timezone.utc),
            range_start=date(2026, 1, 5),
            range_end=date(2026, 1, 1),  # before start
            bar_count=10,
            summary=summary,
            data_fingerprint="fp",
            app_version="0.1.0",
        )


def test_trade_row_rejects_short_direction():
    """Constitution II."""
    from intraday_trade_spy.storage.models import TradeRow

    with pytest.raises(ValueError):
        TradeRow(
            id=uuid4(),
            run_id=uuid4(),
            user_id=uuid4(),
            direction="SHORT",
            quantity=Decimal("10"),
            entry_at=datetime.now(timezone.utc),
            entry_price=Decimal("500.0"),
            stop_price=Decimal("495.0"),
            target_price=Decimal("510.0"),
            exit_at=datetime.now(timezone.utc),
            exit_price=Decimal("510.0"),
            exit_reason="target",
            pnl=Decimal("100.0"),
            r_multiple=Decimal("2.0"),
        )


def test_trade_row_requires_stop_and_target():
    """Constitution III: NOT NULL stop and target."""
    from intraday_trade_spy.storage.models import TradeRow

    with pytest.raises(ValueError):
        TradeRow(
            id=uuid4(),
            run_id=uuid4(),
            user_id=uuid4(),
            direction="LONG",
            quantity=Decimal("10"),
            entry_at=datetime.now(timezone.utc),
            entry_price=Decimal("500.0"),
            stop_price=None,  # missing!
            target_price=Decimal("510.0"),
            exit_at=datetime.now(timezone.utc),
            exit_price=Decimal("510.0"),
            exit_reason="target",
            pnl=Decimal("100.0"),
            r_multiple=Decimal("2.0"),
        )


def test_trade_row_exit_reason_constrained():
    from intraday_trade_spy.storage.models import TradeRow

    with pytest.raises(ValueError):
        TradeRow(
            id=uuid4(),
            run_id=uuid4(),
            user_id=uuid4(),
            direction="LONG",
            quantity=Decimal("10"),
            entry_at=datetime.now(timezone.utc),
            entry_price=Decimal("500.0"),
            stop_price=Decimal("495.0"),
            target_price=Decimal("510.0"),
            exit_at=datetime.now(timezone.utc),
            exit_price=Decimal("510.0"),
            exit_reason="manual_override",
            pnl=Decimal("100.0"),
            r_multiple=Decimal("2.0"),
        )
