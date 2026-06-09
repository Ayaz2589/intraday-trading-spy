"""Feature 022 — /api/replay (contracts/replay-api.md).

Historic trade replay: an ephemeral, in-memory, per-user simulation paced over a
stored session. No database writes, no brokerage — the engine drives the
backtest primitives against historical bars. The one-active-replay guard and all
state live in the `REPLAY_RUNNING` registry, owned here."""

from __future__ import annotations

import uuid
from datetime import date
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from intraday_trade_spy.api.claude_analyst import DEFAULT_CONFIG_PATH
from intraday_trade_spy.api.deps import auth_user_id, get_storage_client
from intraday_trade_spy.config import build_effective_config, load_config
from intraday_trade_spy.replay.dates import list_replayable_dates
from intraday_trade_spy.replay.engine import ReplayEngine, load_session_df
from intraday_trade_spy.replay.runner import REPLAY_RUNNING, ReplayRunner
from intraday_trade_spy.replay.session import ReplaySession, build_performance

router = APIRouter(prefix="/replay")

# Bound the date-picker scan to a sane lower bound (data foundation start).
_RANGE_START = "2018-01-01"


async def _pace(runner: ReplayRunner) -> None:
    """Background pacing loop. Module-level so tests can monkeypatch it to a
    no-op and drive `runner.advance()` deterministically."""
    await runner.run()


def _active_config(storage):
    """The user's active config merged over the base, or the base config when
    none is active (replay is comparable to backtests run under that config)."""
    cfg_row = storage.get_active_config()
    if cfg_row is None:
        return load_config(DEFAULT_CONFIG_PATH), {}
    params = cfg_row.get("params") or {}
    return build_effective_config(params, base_path=DEFAULT_CONFIG_PATH), params


def _runner_for(user_id: UUID) -> ReplayRunner | None:
    return REPLAY_RUNNING.get(str(user_id))


def _range_end() -> str:
    return date.today().isoformat()


@router.get("/dates")
def replay_dates(
    user_id: UUID = Depends(auth_user_id),  # noqa: B008, ARG001 — FastAPI DI
    storage_client=Depends(get_storage_client),  # noqa: B008
) -> dict:
    dates = list_replayable_dates(
        storage_client, range_start=_RANGE_START, range_end=_range_end()
    )
    return {
        "dates": dates,
        "earliest": dates[-1] if dates else None,
        "latest": dates[0] if dates else None,
    }


class StartBody(BaseModel):
    date: str
    speed: int | None = None
    automation: bool = False


@router.post("/start", status_code=201)
def start_replay(
    body: StartBody,
    background_tasks: BackgroundTasks,
    user_id: UUID = Depends(auth_user_id),  # noqa: B008
    storage_client=Depends(get_storage_client),  # noqa: B008
) -> dict:
    existing = _runner_for(user_id)
    if existing is not None and existing.session.status in ("playing", "paused"):
        raise HTTPException(
            status_code=409,
            detail={"error": "replay_already_active",
                    "message": "a replay is already active; stop it first"},
        )

    try:
        session_date = date.fromisoformat(body.date)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={"error": "bad_date", "message": str(exc)},
        ) from exc

    cfg, params = _active_config(storage_client)
    speed = body.speed if body.speed is not None else cfg.replay.default_speed
    if speed not in cfg.replay.speeds:
        raise HTTPException(
            status_code=422,
            detail={"error": "bad_speed",
                    "message": f"speed must be one of {cfg.replay.speeds}"},
        )

    df = load_session_df(storage_client, session_date, market=cfg.market)
    if df is None or len(df) == 0:
        raise HTTPException(
            status_code=422,
            detail={"error": "no_session",
                    "message": f"{body.date} has no covered session "
                               "(weekend/holiday/missing data)"},
        )

    engine = ReplayEngine(cfg=cfg, df=df, automation=body.automation)
    session = ReplaySession(
        id=uuid.uuid4().hex,
        user_id=str(user_id),
        session_date=session_date,
        config_snapshot=params,
        speed=speed,
        engine=engine,
    )
    runner = ReplayRunner(session=session)
    REPLAY_RUNNING[str(user_id)] = runner
    background_tasks.add_task(_pace, runner)
    return session.state_dict()


@router.get("/state")
def replay_state(
    user_id: UUID = Depends(auth_user_id),  # noqa: B008
    storage_client=Depends(get_storage_client),  # noqa: B008, ARG001
) -> dict:
    runner = _runner_for(user_id)
    if runner is None:
        return {"session": None}
    return runner.session.state_dict()


class ControlBody(BaseModel):
    action: str  # play | pause | speed | automation
    speed: int | None = None
    enabled: bool | None = None


@router.post("/control")
def replay_control(
    body: ControlBody,
    user_id: UUID = Depends(auth_user_id),  # noqa: B008
    storage_client=Depends(get_storage_client),  # noqa: B008, ARG001
) -> dict:
    runner = _runner_for(user_id)
    if runner is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "no_replay", "message": "no active replay"},
        )
    if body.action == "play":
        runner.play()
    elif body.action == "pause":
        runner.pause()
    elif body.action == "speed":
        cfg = load_config(DEFAULT_CONFIG_PATH)
        if body.speed not in cfg.replay.speeds:
            raise HTTPException(
                status_code=422,
                detail={"error": "bad_speed",
                        "message": f"speed must be one of {cfg.replay.speeds}"},
            )
        runner.set_speed(body.speed)
    elif body.action == "automation":
        runner.set_automation(bool(body.enabled))
    else:
        raise HTTPException(
            status_code=422,
            detail={"error": "bad_action",
                    "message": "action must be play|pause|speed|automation"},
        )
    return runner.session.state_dict()


@router.post("/stop")
def stop_replay(
    user_id: UUID = Depends(auth_user_id),  # noqa: B008
    storage_client=Depends(get_storage_client),  # noqa: B008, ARG001
) -> dict:
    runner = _runner_for(user_id)
    if runner is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "no_replay", "message": "no active replay"},
        )
    runner.stop()
    state = runner.session.state_dict()
    REPLAY_RUNNING.pop(str(user_id), None)
    return state


@router.get("/bars")
def replay_bars(
    since: str | None = None,
    user_id: UUID = Depends(auth_user_id),  # noqa: B008
    storage_client=Depends(get_storage_client),  # noqa: B008, ARG001
) -> dict:
    runner = _runner_for(user_id)
    if runner is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "no_replay", "message": "no active replay"},
        )
    bars = runner.engine.delivered_bars(since=since)
    return {
        "view": "5m",
        "bars": bars,
        "vwap_available": True,
        "vwap_reason": None,
        "position_levels": runner.engine.position_levels(),
        "next_since": bars[-1]["t"] if bars else since,
    }


@router.get("/journal")
def replay_journal(
    since_seq: int = 0,
    user_id: UUID = Depends(auth_user_id),  # noqa: B008
    storage_client=Depends(get_storage_client),  # noqa: B008, ARG001
) -> dict:
    runner = _runner_for(user_id)
    if runner is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "no_replay", "message": "no active replay"},
        )
    return {"events": runner.engine.journal.events(since_seq=since_seq)}


@router.get("/performance")
def replay_performance(
    user_id: UUID = Depends(auth_user_id),  # noqa: B008
    storage_client=Depends(get_storage_client),  # noqa: B008, ARG001
) -> dict:
    runner = _runner_for(user_id)
    if runner is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "no_replay", "message": "no active replay"},
        )
    return build_performance(runner.engine)


class OrderBody(BaseModel):
    stop_loss: float
    take_profit: float


@router.post("/orders", status_code=202)
def replay_order(
    body: OrderBody,
    user_id: UUID = Depends(auth_user_id),  # noqa: B008
    storage_client=Depends(get_storage_client),  # noqa: B008, ARG001
) -> dict:
    runner = _runner_for(user_id)
    if runner is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "no_replay", "message": "no active replay"},
        )
    eng = runner.engine
    last = eng.last_bar() if hasattr(eng, "last_bar") else None
    price = last.close if last is not None else None
    if price is None:
        raise HTTPException(
            status_code=409,
            detail={"error": "no_bar", "message": "no bar revealed yet to price the entry"},
        )
    out = eng.submit_manual(
        stop_loss=body.stop_loss, take_profit=body.take_profit,
        price=price, now=runner.session.sim_clock,
    )
    if not out["approved"]:
        code = 422 if str(out["reason"]).startswith("invalid_levels") else 409
        raise HTTPException(
            status_code=code,
            detail={"error": "rejected", "message": out["reason"]},
        )
    return {"accepted": True, "quantity": out.get("quantity")}


@router.post("/position/close", status_code=202)
def replay_close(
    user_id: UUID = Depends(auth_user_id),  # noqa: B008
    storage_client=Depends(get_storage_client),  # noqa: B008, ARG001
) -> dict:
    runner = _runner_for(user_id)
    if runner is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "no_replay", "message": "no active replay"},
        )
    out = runner.engine.close_manual()
    if not out["accepted"]:
        raise HTTPException(
            status_code=409,
            detail={"error": "flat", "message": out["reason"]},
        )
    return {"accepted": True}
