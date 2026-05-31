"""Push orchestrator: read local backtest outputs, build a PushRunPayload,
and atomically write it to Supabase.

The transformation maps the in-memory backtest journal (local `JournalEntry`
objects with `SignalStatus`) into the cloud schema's `SignalRow`,
`TradeRow`, and `JournalEventRow` types.

Local layout (produced by the existing CLI):
  data/backtests/<run_id>/
    ├── run.yaml          # BacktestRun (run-level metadata + summary)
    ├── summary.json      # SummaryMetrics
    └── journal.csv       # one row per SignalStatus event

Cloud destination: `push_run(jsonb)` Postgres function — single transaction.
"""

from __future__ import annotations

import csv
import json
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

import yaml

from intraday_trade_spy.storage.exceptions import CloudPushError, SchemaError

if TYPE_CHECKING:
    from intraday_trade_spy.storage.client import SupabaseStorageClient
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


def gather_run_outputs(
    run_dir: Path,
    *,
    user_id: UUID,
    config_id: UUID,
    strategy_id: UUID,
    run_uuid: UUID | None = None,
) -> PushRunPayload:
    """Read local backtest outputs and convert them into a PushRunPayload.

    Args:
        run_dir: A directory like `data/backtests/<run_id>/` containing
            `run.yaml`, `summary.json`, `journal.csv`.
        user_id: The auth.users.id this push is on behalf of.
        config_id: The cloud configs.id this run used.
        strategy_id: The cloud strategies.id this run used.
        run_uuid: Optional explicit UUID for the cloud run row. If omitted,
            a fresh uuid4 is generated.

    Returns:
        A validated PushRunPayload ready for push_run().
    """
    run_yaml_path = run_dir / "run.yaml"
    summary_path = run_dir / "summary.json"
    journal_path = run_dir / "journal.csv"

    if not run_yaml_path.exists():
        raise SchemaError(f"missing {run_yaml_path}")
    if not journal_path.exists():
        raise SchemaError(f"missing {journal_path}")

    run_yaml = yaml.safe_load(run_yaml_path.read_text())
    summary_data = json.loads(summary_path.read_text())

    cloud_run_id = run_uuid or uuid4()

    cloud_summary = RunSummary(
        pnl=Decimal(str(summary_data.get("total_pnl_dollars", 0.0))),
        win_rate=summary_data.get("win_rate", 0.0),
        sharpe=0.0,  # not in local summary; safe default
        max_drawdown=Decimal(str(summary_data.get("max_drawdown_r", 0.0))),
        total_trades=summary_data.get("total_trades", 0),
        total_signals=_count_signals(journal_path),
        rejected_signals=summary_data.get("rejected_signal_count", 0),
    )

    fp = run_yaml["data_fingerprint"]
    cloud_run = RunRow(
        id=cloud_run_id,
        user_id=user_id,
        config_id=config_id,
        strategy_id=strategy_id,
        started_at=_parse_dt(run_yaml["run_started_at"]),
        finished_at=_parse_dt(run_yaml["run_ended_at"]),
        range_start=_first_session(fp),
        range_end=_last_session(fp),
        bar_count=fp["bar_count"],
        summary=cloud_summary,
        data_fingerprint=fp["sha256"],
        app_version=run_yaml.get("code_version", "unversioned"),
    )

    trades, signals, journal_events = _transform_journal(
        journal_path,
        user_id=user_id,
        run_id=cloud_run_id,
    )

    return PushRunPayload(
        run=cloud_run,
        trades=trades,
        signals=signals,
        journal_events=journal_events,
    )


def push_run(
    client: "SupabaseStorageClient",
    run_dir: Path,
    *,
    config_id: UUID,
    strategy_id: UUID,
    run_uuid: UUID | None = None,
) -> str:
    """End-to-end: gather → push. Returns the cloud run_id."""
    payload = gather_run_outputs(
        run_dir,
        user_id=UUID(client.user_id),
        config_id=config_id,
        strategy_id=strategy_id,
        run_uuid=run_uuid,
    )
    return client.push_run(payload)


# ---------- internal helpers ----------

def _parse_dt(value) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value))


def _first_session(fp: dict) -> date:
    earliest = _parse_dt(fp["earliest_timestamp"])
    return earliest.date()


def _last_session(fp: dict) -> date:
    latest = _parse_dt(fp["latest_timestamp"])
    return latest.date()


def _count_signals(journal_path: Path) -> int:
    count = 0
    with journal_path.open() as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("status") in {"executed", "rejected"}:
                count += 1
    return count


def _transform_journal(
    journal_path: Path,
    *,
    user_id: UUID,
    run_id: UUID,
) -> tuple[list[TradeRow], list[SignalRow], list[JournalEventRow]]:
    """Map local journal CSV rows to cloud SignalRow / TradeRow / JournalEventRow.

    Pairing strategy:
      - executed + matching exited/force_flat row → one TradeRow + one SignalRow(executed=True)
      - rejected row → one SignalRow(executed=False)
      - lockout / force_flat (outside a trade) → one JournalEventRow

    The matching is by signal timestamp — the engine emits rows in causal order
    so each `executed` is followed by exactly one `exited` or `force_flat`.
    """
    trades: list[TradeRow] = []
    signals: list[SignalRow] = []
    events: list[JournalEventRow] = []

    pending_executed: dict | None = None

    with journal_path.open() as f:
        reader = csv.DictReader(f)
        for row in reader:
            status = row.get("status")

            if status in {"emitted", "approved"}:
                continue

            if status == "rejected":
                signals.append(_signal_from_rejected(row, user_id=user_id, run_id=run_id))
                continue

            if status == "executed":
                pending_executed = row
                continue

            if status in {"exited", "force_flat"} and pending_executed is not None:
                trade = _trade_from_pair(pending_executed, row, user_id=user_id, run_id=run_id)
                trades.append(trade)
                signals.append(_signal_from_executed(pending_executed, trade.id, user_id=user_id, run_id=run_id))
                if status == "force_flat":
                    events.append(_event_force_flat(row, user_id=user_id, run_id=run_id))
                pending_executed = None
                continue

            if status == "lockout":
                events.append(_event_lockout(row, user_id=user_id, run_id=run_id))

    return trades, signals, events


def _ctx_from_row(row: dict) -> SignalIndicatorContext:
    return SignalIndicatorContext(
        vwap=Decimal(row.get("vwap") or "0"),
        opening_range_high=Decimal(row.get("or_high") or "0"),
        opening_range_low=Decimal(row.get("or_low") or "0"),
        bar_open=Decimal(row.get("planned_entry") or "0"),
        bar_high=Decimal(row.get("planned_entry") or "0"),
        bar_low=Decimal(row.get("planned_entry") or "0"),
        bar_close=Decimal(row.get("planned_entry") or "0"),
        bar_volume=0,
    )


def _signal_from_rejected(row: dict, *, user_id: UUID, run_id: UUID) -> SignalRow:
    return SignalRow(
        id=uuid4(),
        run_id=run_id,
        user_id=user_id,
        emitted_at=_parse_dt(row["timestamp"]),
        direction="LONG",
        entry_price=Decimal(row.get("planned_entry") or "1"),
        stop_price=Decimal(row["stop_loss"]) if row.get("stop_loss") else None,
        target_price=Decimal(row["take_profit"]) if row.get("take_profit") else None,
        executed=False,
        rejection_reason=_normalize_rejection_reason(row.get("rejection_check")),
        trade_id=None,
        indicator_context=_ctx_from_row(row),
        reason_text=row.get("reason", ""),
    )


def _signal_from_executed(
    exec_row: dict, trade_id: UUID, *, user_id: UUID, run_id: UUID
) -> SignalRow:
    return SignalRow(
        id=uuid4(),
        run_id=run_id,
        user_id=user_id,
        emitted_at=_parse_dt(exec_row["timestamp"]),
        direction="LONG",
        entry_price=Decimal(exec_row.get("actual_entry") or exec_row.get("planned_entry") or "1"),
        stop_price=Decimal(exec_row["stop_loss"]),
        target_price=Decimal(exec_row["take_profit"]),
        executed=True,
        rejection_reason=None,
        trade_id=trade_id,
        indicator_context=_ctx_from_row(exec_row),
        reason_text=exec_row.get("reason", ""),
    )


def _trade_from_pair(
    exec_row: dict, exit_row: dict, *, user_id: UUID, run_id: UUID
) -> TradeRow:
    return TradeRow(
        id=uuid4(),
        run_id=run_id,
        user_id=user_id,
        direction="LONG",
        quantity=Decimal(exec_row.get("quantity") or "1"),
        entry_at=_parse_dt(exec_row["timestamp"]),
        entry_price=Decimal(exec_row["actual_entry"]),
        stop_price=Decimal(exec_row["stop_loss"]),
        target_price=Decimal(exec_row["take_profit"]),
        exit_at=_parse_dt(exit_row["timestamp"]),
        exit_price=Decimal(exit_row["actual_exit"]),
        exit_reason=_normalize_exit_reason(exit_row.get("exit_reason") or exit_row.get("status")),
        pnl=Decimal(exit_row.get("realized_pnl") or "0"),
        r_multiple=Decimal(exit_row.get("realized_r") or "0"),
    )


def _event_force_flat(row: dict, *, user_id: UUID, run_id: UUID) -> JournalEventRow:
    return JournalEventRow(
        id=uuid4(),
        run_id=run_id,
        user_id=user_id,
        occurred_at=_parse_dt(row["timestamp"]),
        kind="force_flat",
        severity="warning",
        message=row.get("reason", "force_flat exit"),
        details=JournalEventDetails(**{k: v for k, v in row.items() if v}),
    )


def _event_lockout(row: dict, *, user_id: UUID, run_id: UUID) -> JournalEventRow:
    return JournalEventRow(
        id=uuid4(),
        run_id=run_id,
        user_id=user_id,
        occurred_at=_parse_dt(row["timestamp"]),
        kind="risk_decision",
        severity="warning",
        message=row.get("reason", "lockout"),
        details=JournalEventDetails(**{k: v for k, v in row.items() if v}),
    )


def _normalize_rejection_reason(check: str | None) -> str:
    """Map engine's rejection_check strings to the DB CHECK list.

    The engine emits the `reason` field of `RiskDecision` (or strategy-side
    rejection text) via the journal's `rejection_check` column. Mapping these
    raw strings to the constitutional DB enum on `signals.rejection_reason`.
    """
    if not check:
        return "other"
    mapping = {
        # Risk manager reasons (backend/src/intraday_trade_spy/risk/manager.py)
        "non_spy_symbol": "wrong_symbol",
        "position_already_open": "duplicate_signal",
        "daily_loss_limit_reached": "daily_loss_hit",
        "max_trades_per_day_reached": "max_trades_hit",
        "consecutive_losses_reached": "consecutive_loss_cap",
        "cooldown_active": "cooldown_after_loss",
        "no_new_trades_after": "no_new_trades_cutoff",
        "position_size_zero": "position_size_cap",
        "position_value_exceeds_cap": "position_size_cap",
        # Legacy / alternate spellings (kept for forward compat)
        "no_stop_loss": "missing_stop",
        "no_take_profit": "missing_target",
        "wrong_symbol": "wrong_symbol",
        "wrong_direction": "wrong_direction",
        "daily_loss_limit": "daily_loss_hit",
        "max_trades": "max_trades_hit",
        "duplicate_signal": "duplicate_signal",
        "position_size": "position_size_cap",
        "stale_data": "stale_data",
        "or_incomplete": "opening_range_not_complete",
        "cooldown": "cooldown_after_loss",
        "consecutive_losses": "consecutive_loss_cap",
        "no_new_trades_cutoff": "no_new_trades_cutoff",
        "force_flat_window": "force_flat_window",
    }
    return mapping.get(check, "other")


def _normalize_exit_reason(reason: str | None) -> str:
    if not reason:
        return "other"
    if reason in {"target", "stop", "force_flat", "timeout", "other"}:
        return reason
    return "other"


def config_from_yaml(
    *,
    config_id: UUID,
    user_id: UUID,
    strategy_id: UUID,
    name: str,
    yaml_path: Path,
    mode: str = "backtest",
) -> ConfigRow:
    """Helper: convert a local backend/config/config.yaml into a cloud ConfigRow."""
    raw = yaml.safe_load(yaml_path.read_text())
    risk = raw.get("risk", {})
    market = raw.get("market", {})
    indicators = raw.get("indicators", {})

    params = ConfigParams(
        max_risk_per_trade=risk.get("max_risk_per_trade", 0.01),
        max_daily_loss=risk.get("max_daily_loss", 0.02),
        max_trades_per_day=risk.get("max_trades_per_day", 3),
        max_consecutive_losses=risk.get("max_consecutive_losses", 2),
        cooldown_after_loss_minutes=risk.get("cooldown_after_loss_minutes", 15),
        no_new_trades_cutoff=market.get("no_new_trades_cutoff", "15:30"),
        force_flat_time=market.get("force_flat_time", "15:55"),
        opening_range_minutes=indicators.get("opening_range_minutes", 15),
        position_value_cap=risk.get("position_value_cap", 50_000.0),
    )

    return ConfigRow(
        id=config_id,
        user_id=user_id,
        strategy_id=strategy_id,
        name=name,
        mode=mode,
        live_auto_enabled=False,
        timeframe="5m",
        params=params,
    )
