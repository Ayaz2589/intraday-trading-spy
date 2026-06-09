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
from intraday_trade_spy.live.alpaca_broker import AlpacaPaperBroker
from intraday_trade_spy.live.journal import LiveJournal
from intraday_trade_spy.storage.client import PaperSessionAlreadyRunning

ET = ZoneInfo("America/New_York")

router = APIRouter(prefix="/trade")

# Feature 024 — transient Alpaca REST failures (SSL EOF, connection resets,
# timeouts, "max retries exceeded") are common under load and self-recover; a
# blind 500 blips the chart on every poll. Retry a few times with short
# backoff, then let callers surface a clean 503.
_TRANSIENT_NET_MARKERS = (
    "ssl", "eof occurred", "unexpected_eof", "connection reset",
    "connection aborted", "connectionerror", "timed out", "timeout",
    "max retries exceeded", "remotedisconnected", "temporarily unavailable",
)


def is_transient_net_error(exc: Exception) -> bool:
    text = f"{type(exc).__name__} {exc}".lower()
    return any(marker in text for marker in _TRANSIENT_NET_MARKERS)


def retry_transient(fn, *, attempts: int = 3, backoff: tuple = (0.25, 0.75),
                    sleep=None):
    """Call fn(); on a TRANSIENT network/SSL error retry up to `attempts` times
    with short backoff. Non-transient errors raise immediately; a transient
    error that survives every attempt re-raises (callers map it to 503)."""
    import time as _time

    sleep = sleep or _time.sleep
    last: Exception | None = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 — reraised below
            if not is_transient_net_error(exc):
                raise
            last = exc
            if i < attempts - 1:
                sleep(backoff[min(i, len(backoff) - 1)])
    raise last  # type: ignore[misc]


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

        # Feature 023 — backfill today's elapsed RTH bars so indicators are
        # correct on the first live bar (journals the warmup outcome; fail-soft).
        warmup_bars = warmup_session(storage, session["id"])
        runner = PaperSessionRunner(
            cfg=cfg,
            session=session,
            storage=storage,
            broker=AlpacaPaperBroker(),
            market_stream_factory=lambda: StockDataStream(key, secret, feed=feed),
            trade_stream_factory=lambda: TradingStream(key, secret, paper=True),
            warmup_bars=warmup_bars,
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


# ---- market data fetchers (thin wrappers; logic lives in live/market_view) -----

def fetch_intraday_df():
    """Today's 1-minute SPY bars via the Alpaca historical client (REST).
    Thin wrapper — monkeypatched in tests; view math is in market_view."""
    import pandas as pd
    from alpaca.data.enums import Adjustment, DataFeed
    from alpaca.data.historical import StockHistoricalDataClient
    from alpaca.data.requests import StockBarsRequest
    from alpaca.data.timeframe import TimeFrame, TimeFrameUnit

    cfg = load_config(DEFAULT_CONFIG_PATH)
    client = StockHistoricalDataClient(
        os.environ["ALPACA_API_KEY"], os.environ["ALPACA_SECRET_KEY"],
    )
    today = _today()
    req = StockBarsRequest(
        symbol_or_symbols="SPY",
        timeframe=TimeFrame(1, TimeFrameUnit.Minute),
        start=datetime(today.year, today.month, today.day, 9, 30, tzinfo=ET),
        adjustment=Adjustment.SPLIT,
        feed=DataFeed.SIP if cfg.alpaca.feed == "sip" else DataFeed.IEX,
    )
    bars = retry_transient(lambda: client.get_stock_bars(req)).data.get("SPY", [])
    return pd.DataFrame([{
        "timestamp": b.timestamp, "open": float(b.open), "high": float(b.high),
        "low": float(b.low), "close": float(b.close), "volume": int(b.volume),
    } for b in bars])


def fetch_warmup_bars() -> list:
    """Feature 023 — today's already-elapsed regular-session bars as completed
    5m `Bar`s, for indicator warmup at session start. Reuses the RTH intraday
    fetcher (start=09:30) so it is RTH-only by construction, then aggregates
    1m → completed 5m buckets. The still-open final bucket is intentionally
    NOT flushed — the live stream continues from it (avoids a duplicate bar at
    the boundary). Fail-soft: returns [] on empty data or any error so a start
    never crashes (FR-008)."""
    try:
        from intraday_trade_spy.live.aggregator import BarAggregator
        from intraday_trade_spy.models import Bar

        df = fetch_intraday_df()
        if df is None or df.empty:
            return []
        agg = BarAggregator()
        out: list = []
        for row in df.itertuples(index=False):
            ts = row.timestamp
            bar = Bar(
                symbol="SPY", timestamp=ts, open=float(row.open),
                high=float(row.high), low=float(row.low), close=float(row.close),
                volume=int(row.volume), session_date=ts.astimezone(ET).date(),
            )
            out += agg.push(bar)
        return out  # completed buckets only — open bucket left to the stream
    except Exception:  # noqa: BLE001 — warmup is best-effort; never fail the start
        return []


def warmup_session(storage, session_id) -> list:
    """Fetch RTH warmup bars and journal the outcome (FR-006). Always journals
    a `warmup` event (loaded=N, including 0) so the audit trail records the
    backfill; never raises (fetch_warmup_bars is itself fail-soft)."""
    bars = fetch_warmup_bars()
    try:
        LiveJournal(storage, session_id=session_id).lifecycle(
            "warmup", timestamp=_now(), trading_day=_today(), loaded=len(bars),
        )
    except Exception:  # noqa: BLE001 — journaling must not fail the start
        pass
    return bars


def fetch_daily_df(days: int):
    """~N calendar days of daily SPY bars (the 30d view)."""
    from datetime import timedelta

    import pandas as pd
    from alpaca.data.enums import Adjustment, DataFeed
    from alpaca.data.historical import StockHistoricalDataClient
    from alpaca.data.requests import StockBarsRequest
    from alpaca.data.timeframe import TimeFrame

    cfg = load_config(DEFAULT_CONFIG_PATH)
    client = StockHistoricalDataClient(
        os.environ["ALPACA_API_KEY"], os.environ["ALPACA_SECRET_KEY"],
    )
    req = StockBarsRequest(
        symbol_or_symbols="SPY",
        timeframe=TimeFrame.Day,
        start=_now() - timedelta(days=days + 3),
        adjustment=Adjustment.SPLIT,
        feed=DataFeed.SIP if cfg.alpaca.feed == "sip" else DataFeed.IEX,
    )
    bars = retry_transient(lambda: client.get_stock_bars(req)).data.get("SPY", [])
    return pd.DataFrame([{
        "timestamp": b.timestamp, "open": float(b.open), "high": float(b.high),
        "low": float(b.low), "close": float(b.close), "volume": int(b.volume),
    } for b in bars])


def _have_creds() -> bool:
    return bool(os.environ.get("ALPACA_API_KEY")
                and os.environ.get("ALPACA_SECRET_KEY"))


def _clock():
    from datetime import time as _time

    from intraday_trade_spy.clock import MarketClock

    cfg = load_config(DEFAULT_CONFIG_PATH)
    return cfg, MarketClock(
        session_start=_time.fromisoformat(cfg.market.session_start),
        session_end=_time.fromisoformat(cfg.market.session_end),
        no_new_trades_after=_time.fromisoformat(cfg.market.no_new_trades_after),
        force_flat_time=_time.fromisoformat(cfg.market.force_flat_time),
    )


def _position_levels(broker) -> dict | None:
    """Entry/stop/target for the chart, derived from broker truth."""
    pos = broker.get_position()
    if pos is None:
        return None
    stop = target = None
    for o in broker.get_open_orders():
        if o.get("stop_price"):
            stop = o["stop_price"]
        elif o.get("limit_price"):
            target = o["limit_price"]
    return {"entry": pos["avg_entry"], "stop": stop, "target": target}


@router.get("/state")
def trade_state(
    user_id: UUID = Depends(auth_user_id),  # noqa: B008, ARG001 — FastAPI DI
    storage_client=Depends(get_storage_client),  # noqa: B008
) -> dict:
    cfg, clock = _clock()
    now = _now()
    session = storage_client.get_running_paper_session()

    position = open_orders = account = None
    last_bar_at = None
    data_fresh = None
    if _have_creds():
        try:
            broker = AlpacaPaperBroker()
            position = broker.get_position()
            open_orders = broker.get_open_orders()
            sizing = (
                ((session or {}).get("config_snapshot") or {})
                .get("risk", {}).get("account_value")
            ) or cfg.risk.account_value
            drift = bool(session and session.get("entries_paused")
                         and session.get("pause_reason") == "reconcile_mismatch")
            account = {
                "broker_equity": broker.get_account()["equity"],
                "sizing_account_value": float(sizing),
                "reconciled_at": now.isoformat(),
                "drift": drift,
            }
        except Exception:  # noqa: BLE001 — broker down ≠ page down
            position = open_orders = account = None
        try:
            df = fetch_intraday_df()
            if not df.empty:
                last_bar = df["timestamp"].max()
                last_bar_at = last_bar.isoformat()
                data_fresh = (
                    (now - last_bar).total_seconds() <= cfg.paper.stale_data_seconds
                    if clock.is_market_open(now) else None
                )
        except Exception:  # noqa: BLE001
            pass

    today_trades = []
    if session:
        try:
            today_trades = [
                t for t in storage_client.list_paper_trades(
                    session_id=session["id"])
                if str(t.get("trading_day")) == str(_today())
            ]
        except Exception:  # noqa: BLE001
            today_trades = []

    return {
        "session": session,
        "market": {
            "is_open": clock.is_market_open(now),
            "allow_new_trades": clock.allow_new_trades(now),
            "force_flat_at": cfg.market.force_flat_time,
            "no_new_trades_after": cfg.market.no_new_trades_after,
            "session_start": cfg.market.session_start,
            "data_fresh": data_fresh,
            "last_bar_at": last_bar_at,
        },
        "position": position,
        "open_orders": open_orders,
        "today": {
            "trades": len(today_trades),
            "fills": len(today_trades) * 2,
            "realized_pnl": float(sum(
                float(t.get("gross_pnl") or 0) for t in today_trades
            )),
        },
        "account": account,
    }


@router.get("/bars")
def trade_bars(
    view: str,
    since: str | None = None,
    user_id: UUID = Depends(auth_user_id),  # noqa: B008, ARG001 — FastAPI DI
    storage_client=Depends(get_storage_client),  # noqa: B008, ARG001
) -> dict:
    from intraday_trade_spy.live.market_view import daily_view, intraday_view

    if view not in ("1m", "5m", "1d", "30d"):
        raise HTTPException(
            status_code=422,
            detail={"error": "unknown_view",
                    "message": "view must be one of 1m, 5m, 1d, 30d"},
        )
    cfg = load_config(DEFAULT_CONFIG_PATH)
    try:
        if view == "30d":
            bars = daily_view(fetch_daily_df(cfg.paper.chart_30d_days), since=since)
            vwap_available = False
            vwap_reason = ("VWAP is anchored to a single trading session — it has "
                           "no meaning on daily candles")
        else:
            bars = intraday_view(fetch_intraday_df(), view=view, since=since)
            vwap_available = True
            vwap_reason = None
    except Exception as exc:  # noqa: BLE001 — transient Alpaca blip → clean 503
        if is_transient_net_error(exc):
            raise HTTPException(
                status_code=503,
                detail={"error": "data_unavailable",
                        "message": "market data temporarily unavailable; please retry"},
            ) from exc
        raise

    levels = None
    if _have_creds():
        try:
            levels = _position_levels(AlpacaPaperBroker())
        except Exception:  # noqa: BLE001
            levels = None

    return {
        "view": view,
        "bars": bars,
        "vwap_available": vwap_available,
        "vwap_reason": vwap_reason,
        "position_levels": levels,
        "next_since": bars[-1]["t"] if bars else since,
    }


@router.post("/automation/ack-pause")
def ack_pause(
    user_id: UUID = Depends(auth_user_id),  # noqa: B008, ARG001 — FastAPI DI
    storage_client=Depends(get_storage_client),  # noqa: B008
) -> dict:
    row = storage_client.get_running_paper_session()
    if row is None:
        raise HTTPException(
            status_code=409,
            detail={"error": "no_running_session",
                    "message": "no automation session is running"},
        )
    from intraday_trade_spy.live.runner import RUNNING

    runner = RUNNING.get(row["id"])
    if runner is not None:
        # the live engine journals reconcile_ack and unpauses itself
        runner._engine.acknowledge_reconcile(_now())
    storage_client.set_paper_session_pause(
        session_id=row["id"], paused=False, reason=None,
    )
    if runner is None:
        LiveJournal(storage_client, session_id=row["id"]).lifecycle(
            "reconcile_ack", timestamp=_now(), trading_day=_today(),
            reason="operator acknowledged (runner offline)",
        )
    return {**row, "entries_paused": False, "pause_reason": None}


# ---- forward performance record (US3) -----------------------------------------------

@router.get("/performance")
def trade_performance(
    user_id: UUID = Depends(auth_user_id),  # noqa: B008, ARG001 — FastAPI DI
    storage_client=Depends(get_storage_client),  # noqa: B008
) -> dict:
    trades = storage_client.list_paper_trades()
    trades = sorted(trades, key=lambda t: str(t.get("entry_time")))
    rs = [float(t["realized_r"]) for t in trades]
    pnls = [float(t["gross_pnl"]) for t in trades]
    wins = sum(1 for p in pnls if p > 0)
    cum = 0.0
    curve = []
    for t, p in zip(trades, pnls):
        cum += p
        curve.append({"t": str(t.get("exit_time")), "cum_pnl": round(cum, 2)})
    by_session: dict[str, dict] = {}
    for t, r in zip(trades, rs):
        s = by_session.setdefault(str(t["session_id"]), {"trades": 0, "total_r": 0.0})
        s["trades"] += 1
        s["total_r"] += r
    sessions = []
    for row in storage_client.list_paper_sessions():
        agg = by_session.get(str(row["id"]), {"trades": 0, "total_r": 0.0})
        sessions.append({
            "id": row["id"], "started_at": row["started_at"],
            "status": row["status"], "trades": agg["trades"],
            "total_r": round(agg["total_r"], 4),
        })
    n = len(trades)
    return {
        "summary": {
            "trades": n,
            "wins": wins,
            "win_rate": (wins / n) if n else None,
            "expectancy_r": (sum(rs) / n) if n else None,
            "total_r": round(sum(rs), 4),
            "total_gross_pnl": round(sum(pnls), 2),
        },
        "equity_curve": curve,
        "trades": trades,
        "sessions": sessions,
    }


@router.get("/journal")
def trade_journal(
    session_id: str,
    since_seq: int = 0,
    user_id: UUID = Depends(auth_user_id),  # noqa: B008, ARG001 — FastAPI DI
    storage_client=Depends(get_storage_client),  # noqa: B008
) -> dict:
    return {"events": storage_client.list_paper_events(
        session_id=session_id, since_seq=since_seq,
    )}


# ---- manual orders (US4: risk-gated, never exempt) ----------------------------------

from pydantic import BaseModel  # noqa: E402 — local request model


class ManualOrderBody(BaseModel):
    stop_loss: float
    take_profit: float


@router.post("/orders", status_code=201)
def manual_order(
    body: ManualOrderBody,
    user_id: UUID = Depends(auth_user_id),  # noqa: B008, ARG001 — FastAPI DI
    storage_client=Depends(get_storage_client),  # noqa: B008
) -> dict:
    row = storage_client.get_running_paper_session()
    if row is None:
        raise HTTPException(
            status_code=409,
            detail={"error": "no_running_session",
                    "message": "start automation first — manual orders ride "
                               "the running session's risk state and journal"},
        )
    from intraday_trade_spy.live.runner import RUNNING

    runner = RUNNING.get(row["id"])
    if runner is None:
        raise HTTPException(
            status_code=503,
            detail={"error": "runner_unavailable",
                    "message": "the session runner is not alive in this "
                               "process — restart automation"},
        )
    df = fetch_intraday_df()
    if df.empty:
        raise HTTPException(
            status_code=409,
            detail={"error": "no_market_data",
                    "message": "no bars available to price the entry"},
        )
    price = float(df.sort_values("timestamp")["close"].iloc[-1])
    if not (body.stop_loss < price < body.take_profit):
        raise HTTPException(
            status_code=422,
            detail={"error": "invalid_levels",
                    "message": f"stop must be below and target above the "
                               f"current price ({price:.2f})"},
        )
    out = runner._engine.submit_manual(
        stop_loss=body.stop_loss, take_profit=body.take_profit,
        price=price, now=_now(),
    )
    if not out["approved"]:
        raise HTTPException(
            status_code=409,
            detail={"error": "risk_rejected", "message": out["reason"]},
        )
    return out


@router.post("/position/close")
def close_position(
    user_id: UUID = Depends(auth_user_id),  # noqa: B008, ARG001 — FastAPI DI
    storage_client=Depends(get_storage_client),  # noqa: B008
) -> dict:
    broker = AlpacaPaperBroker()
    if broker.get_position() is None:
        raise HTTPException(
            status_code=409,
            detail={"error": "flat", "message": "no open position to close"},
        )
    row = storage_client.get_running_paper_session()
    from intraday_trade_spy.live.runner import RUNNING

    runner = RUNNING.get(row["id"]) if row else None
    if runner is not None:
        # the engine flattens and the close fill journals exit_reason=manual
        runner._engine.close_manual(now=_now())
    else:
        broker.flatten()
    return {"closed": True}
