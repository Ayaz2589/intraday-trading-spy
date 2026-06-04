"""T006 — config-management model surface (Feature 012). Pure Pydantic; no DB."""

from datetime import date, datetime, timezone
from uuid import uuid4

from intraday_trade_spy.storage.models import ConfigParams, ConfigRow, RunRow, RunSummary


def _summary() -> RunSummary:
    return RunSummary(
        pnl=0, win_rate=0.5, sharpe=0.0, max_drawdown=0,
        total_trades=0, total_signals=0, rejected_signals=0,
    )


def test_config_row_is_active_defaults_false():
    c = ConfigRow(
        id=uuid4(), user_id=uuid4(), strategy_id=uuid4(), name="default",
        mode="backtest", params=ConfigParams(),
    )
    assert c.is_active is False


def test_config_row_accepts_is_active():
    c = ConfigRow(
        id=uuid4(), user_id=uuid4(), strategy_id=uuid4(), name="aggressive",
        mode="backtest", params=ConfigParams(), is_active=True,
    )
    assert c.is_active is True


def test_run_row_config_id_is_optional():
    # A run whose config was deleted has config_id = NULL (ON DELETE SET NULL);
    # the run survives via its own snapshot.
    run = RunRow(
        id=uuid4(), user_id=uuid4(), strategy_id=uuid4(),
        started_at=datetime.now(timezone.utc), finished_at=datetime.now(timezone.utc),
        range_start=date(2020, 1, 1), range_end=date(2020, 6, 30), bar_count=100,
        summary=_summary(), data_fingerprint="abc", app_version="test",
        config_id=None,
    )
    assert run.config_id is None
