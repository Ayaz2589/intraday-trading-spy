"""Feature 021 — /api/trade (contracts/trade-api.md).

Automation start/stop for live paper trading. The session runner is an
asyncio BackgroundTask (campaign-task precedent); the stop endpoint signals
the in-process runner AND flips the row, so stop works even if the runner
died. Restart reconciliation (FR-009) lives here too: a previously-running
session is marked interrupted and journaled — never silently resumed."""

from __future__ import annotations

import os
from datetime import UTC, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from intraday_trade_spy.api.claude_analyst import DEFAULT_CONFIG_PATH
from intraday_trade_spy.api.deps import auth_user_id, get_storage_client
from intraday_trade_spy.config import load_config
from intraday_trade_spy.live.journal import LiveJournal
from intraday_trade_spy.storage.client import PaperSessionAlreadyRunning

ET = ZoneInfo("America/New_York")

router = APIRouter(prefix="/trade")


def _now() -> datetime:
    return datetime.now(UTC)


def _today():
    return _now().astimezone(ET).date()


async def run_paper_session_task(*, session: dict, user_id, storage) -> None:
    """BackgroundTask body — wires the REAL broker/streams and runs the
    session. Module-level so tests stub it. Fail-soft: any crash interrupts
    the session row with the reason (never a phantom 'running')."""
    try:
        from alpaca.data.enums import DataFeed
        from alpaca.data.live import StockDataStream
        from alpaca.trading.stream import TradingStream

        from intraday_trade_spy.live.alpaca_broker import AlpacaPaperBroker
        from intraday_trade_spy.live.runner import PaperSessionRunner

        cfg = load_config(DEFAULT_CONFIG_PATH)
        key = os.environ["ALPACA_API_KEY"]
        secret = os.environ["ALPACA_SECRET_KEY"]
        feed = DataFeed.SIP if cfg.alpaca.feed == "sip" else DataFeed.IEX

        runner = PaperSessionRunner(
            cfg=cfg,
            session=session,
            storage=storage,
            broker=AlpacaPaperBroker(),
            market_stream_factory=lambda: StockDataStream(key, secret, feed=feed),
            trade_stream_factory=lambda: TradingStream(key, secret, paper=True),
        )
        await runner.run()
    except Exception as exc:  # noqa: BLE001 — last-resort interrupt
        import logging

        logging.getLogger(__name__).exception("paper session crashed: %s", exc)
        storage.stop_paper_session(
            session_id=session["id"], status="interrupted",
            stop_reason=f"runner crashed: {exc}",
        )


def reconcile_interrupted_paper_sessions(storage) -> int:
    """Startup reconciler (FR-009): mark running sessions interrupted and
    journal each — the operator must explicitly restart automation."""
    ids = storage.interrupt_running_paper_sessions(reason="service restart")
    for session_id in ids:
        try:
            LiveJournal(storage, session_id=session_id).lifecycle(
                "session_interrupted", timestamp=_now(), trading_day=_today(),
                reason="service restart",
            )
        except Exception:  # noqa: BLE001 — reconcile must not fail startup
            pass
    return len(ids)


@router.post("/automation/start", status_code=201)
def start_automation(
    background_tasks: BackgroundTasks,
    user_id: UUID = Depends(auth_user_id),  # noqa: B008 — FastAPI DI idiom
    storage_client=Depends(get_storage_client),  # noqa: B008
) -> dict:
    if not (os.environ.get("ALPACA_API_KEY") and os.environ.get("ALPACA_SECRET_KEY")):
        raise HTTPException(
            status_code=422,
            detail={"error": "alpaca_credentials_missing",
                    "message": "set ALPACA_API_KEY / ALPACA_SECRET_KEY on the "
                               "backend to enable paper trading"},
        )
    cfg_row = storage_client.get_active_config()
    if cfg_row is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "no_active_config",
                    "message": "no active config to trade"},
        )
    try:
        row = storage_client.insert_paper_session(
            strategy_id=cfg_row.get("strategy_id"),
            config_id=cfg_row.get("id"),
            config_name=cfg_row.get("name"),
            config_snapshot=cfg_row.get("params") or {},
        )
    except PaperSessionAlreadyRunning as exc:
        raise HTTPException(
            status_code=409,
            detail={"error": "session_already_running",
                    "message": f"an automation session is already running: {exc}"},
        ) from exc

    journal = LiveJournal(storage_client, session_id=row["id"])
    journal.lifecycle(
        "session_started", timestamp=_now(), trading_day=_today(),
        config_name=row["config_name"], operator="api",
    )
    background_tasks.add_task(
        run_paper_session_task, session=row, user_id=user_id,
        storage=storage_client,
    )
    return row


@router.post("/automation/stop")
def stop_automation(
    user_id: UUID = Depends(auth_user_id),  # noqa: B008, ARG001 — FastAPI DI; storage is user-scoped
    storage_client=Depends(get_storage_client),  # noqa: B008
) -> dict:
    row = storage_client.get_running_paper_session()
    if row is None:
        raise HTTPException(
            status_code=409,
            detail={"error": "no_running_session",
                    "message": "no automation session is running"},
        )
    # Signal the in-process runner if it's alive (FR-006: entries stop NOW;
    # exits keep managing broker-side either way).
    from intraday_trade_spy.live.runner import RUNNING

    runner = RUNNING.get(row["id"])
    if runner is not None:
        runner.request_stop(reason="operator")
    storage_client.stop_paper_session(
        session_id=row["id"], status="stopped", stop_reason="operator",
    )
    LiveJournal(storage_client, session_id=row["id"]).lifecycle(
        "session_stopped", timestamp=_now(), trading_day=_today(),
        reason="operator",
    )
    return {**row, "status": "stopped", "stop_reason": "operator"}
