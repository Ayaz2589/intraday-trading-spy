"""Performance test for cloud push (T042b — covers analyze finding C1, SC-007).

Synthesizes a PushRunPayload with 10,000 signals + 500 trades + 200 journal
events, pushes it, and asserts the push completes in under 60 seconds.

Marked `slow` so it's not part of the default integration suite.
"""

from __future__ import annotations

import time
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest


pytestmark = [pytest.mark.integration, pytest.mark.slow]


SC_007_BUDGET_SECONDS = 60.0


def test_push_run_10k_signals_under_60_seconds(
    supabase_url, service_role_key, db_url, user_a_id, clean_db
):
    from intraday_trade_spy.storage import SupabaseStorageClient
    from intraday_trade_spy.storage.models import (
        ConfigParams,
        ConfigRow,
        JournalEventDetails,
        JournalEventRow,
        PushRunPayload,
        RunRow,
        RunSummary,
        SignalIndicatorContext,
        SignalRow,
        TradeRow,
    )

    client = SupabaseStorageClient(
        url=supabase_url,
        service_role_key=service_role_key,
        user_id=str(user_a_id),
    )

    strategy = client.get_strategy_by_key("vwap_pullback_long")
    config = ConfigRow(
        id=uuid4(),
        user_id=user_a_id,
        strategy_id=strategy.id,
        name="perf-test",
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

    run_id = uuid4()
    now = datetime.now(timezone.utc)

    def _ctx():
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

    # 500 trades + 500 executed signals (paired)
    trades = []
    signals = []
    for i in range(500):
        trade_id = uuid4()
        trades.append(
            TradeRow(
                id=trade_id,
                run_id=run_id,
                user_id=user_a_id,
                direction="LONG",
                quantity=Decimal("10"),
                entry_at=now,
                entry_price=Decimal("500.0"),
                stop_price=Decimal("495.0"),
                target_price=Decimal("510.0"),
                exit_at=now,
                exit_price=Decimal("510.0"),
                exit_reason="target",
                pnl=Decimal("100.0"),
                r_multiple=Decimal("2.0"),
            )
        )
        signals.append(
            SignalRow(
                id=uuid4(),
                run_id=run_id,
                user_id=user_a_id,
                emitted_at=now,
                direction="LONG",
                entry_price=Decimal("500.0"),
                stop_price=Decimal("495.0"),
                target_price=Decimal("510.0"),
                executed=True,
                trade_id=trade_id,
                indicator_context=_ctx(),
                reason_text=f"exec {i}",
            )
        )

    # 9,500 rejected signals to reach 10,000 total
    for i in range(9_500):
        signals.append(
            SignalRow(
                id=uuid4(),
                run_id=run_id,
                user_id=user_a_id,
                emitted_at=now,
                direction="LONG",
                entry_price=Decimal("500.0"),
                stop_price=Decimal("495.0"),
                target_price=Decimal("510.0"),
                executed=False,
                rejection_reason="opening_range_not_complete",
                indicator_context=_ctx(),
                reason_text=f"rejected {i}",
            )
        )

    journal_events = [
        JournalEventRow(
            id=uuid4(),
            run_id=run_id,
            user_id=user_a_id,
            occurred_at=now,
            kind="lifecycle",
            severity="info",
            message=f"lifecycle event {i}",
            details=JournalEventDetails(),
        )
        for i in range(200)
    ]

    run_row = RunRow(
        id=run_id,
        user_id=user_a_id,
        config_id=config.id,
        strategy_id=strategy.id,
        started_at=now,
        finished_at=now,
        range_start=date(2026, 1, 1),
        range_end=date(2026, 1, 5),
        bar_count=10_000,
        summary=RunSummary(
            pnl=Decimal("50000.0"),
            win_rate=1.0,
            sharpe=0.0,
            max_drawdown=Decimal("0"),
            total_trades=500,
            total_signals=10_000,
            rejected_signals=9_500,
        ),
        data_fingerprint="perf-test",
        app_version="test",
    )

    payload = PushRunPayload(
        run=run_row,
        trades=trades,
        signals=signals,
        journal_events=journal_events,
    )

    start = time.perf_counter()
    client.push_run(payload)
    elapsed = time.perf_counter() - start

    assert elapsed < SC_007_BUDGET_SECONDS, (
        f"push_run took {elapsed:.2f}s; SC-007 budget is {SC_007_BUDGET_SECONDS}s"
    )
