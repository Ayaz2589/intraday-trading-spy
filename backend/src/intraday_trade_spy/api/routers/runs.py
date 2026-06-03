"""GET /api/runs[/{id}[/status|/trades|/signals|/journal]]."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query
from pydantic import BaseModel, ConfigDict

from intraday_trade_spy.api import errors
from intraday_trade_spy.api.deps import auth_user_id, get_storage_client
from intraday_trade_spy.api.pagination import decode_cursor
from intraday_trade_spy.api.schemas import (
    BarListResponse,
    BarView,
    ConfigView,
    JournalListResponse,
    RunListResponse,
    RunManifestView,
    RunStatusResponse,
    RunView,
    SignalListResponse,
    StrategyView,
    TradeListResponse,
)


router = APIRouter()


@router.get("/runs", response_model=RunListResponse)
def list_runs(
    limit: int = Query(20, ge=1, le=100),
    cursor: Optional[str] = None,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> RunListResponse:
    try:
        decode_cursor(cursor)
    except ValueError:
        errors.raise_invalid_cursor()

    page = storage_client.list_runs(user_id=user_id, limit=limit, cursor=cursor)
    return RunListResponse(
        runs=[RunView(**row) for row in page.runs],
        next_cursor=page.next_cursor,
    )


@router.get("/runs/{run_id}", response_model=RunView)
def get_run(
    run_id: UUID,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> RunView:
    row = storage_client.get_run(run_id=run_id, user_id=user_id)
    if row is None:
        errors.raise_not_found(f"run {run_id} not found")
    return RunView(**row)


@router.get("/runs/{run_id}/status", response_model=RunStatusResponse)
def get_run_status(
    run_id: UUID,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> RunStatusResponse:
    row = storage_client.get_run_status(run_id=run_id, user_id=user_id)
    if row is None:
        errors.raise_not_found(f"run {run_id} not found")
    return RunStatusResponse(**row)


@router.get("/runs/{run_id}/trades", response_model=TradeListResponse)
def list_trades(
    run_id: UUID,
    limit: int = Query(20, ge=1, le=100),
    cursor: Optional[str] = None,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> TradeListResponse:
    try:
        decode_cursor(cursor)
    except ValueError:
        errors.raise_invalid_cursor()

    if storage_client.get_run(run_id=run_id, user_id=user_id) is None:
        errors.raise_not_found(f"run {run_id} not found")

    page = storage_client.list_trades(run_id=run_id, user_id=user_id, limit=limit, cursor=cursor)
    return TradeListResponse(trades=page.trades, next_cursor=page.next_cursor)


@router.get("/runs/{run_id}/signals", response_model=SignalListResponse)
def list_signals(
    run_id: UUID,
    limit: int = Query(20, ge=1, le=100),
    cursor: Optional[str] = None,
    executed: Optional[bool] = None,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> SignalListResponse:
    try:
        decode_cursor(cursor)
    except ValueError:
        errors.raise_invalid_cursor()

    if storage_client.get_run(run_id=run_id, user_id=user_id) is None:
        errors.raise_not_found(f"run {run_id} not found")

    page = storage_client.list_signals(
        run_id=run_id, user_id=user_id, limit=limit, cursor=cursor, executed=executed
    )
    return SignalListResponse(signals=page.signals, next_cursor=page.next_cursor)


@router.get("/runs/{run_id}/journal", response_model=JournalListResponse)
def list_journal(
    run_id: UUID,
    limit: int = Query(20, ge=1, le=100),
    cursor: Optional[str] = None,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> JournalListResponse:
    try:
        decode_cursor(cursor)
    except ValueError:
        errors.raise_invalid_cursor()

    if storage_client.get_run(run_id=run_id, user_id=user_id) is None:
        errors.raise_not_found(f"run {run_id} not found")

    page = storage_client.list_journal(run_id=run_id, user_id=user_id, limit=limit, cursor=cursor)
    return JournalListResponse(events=page.events, next_cursor=page.next_cursor)


@router.get("/runs/{run_id}/bars", response_model=BarListResponse)
def list_bars(
    run_id: UUID,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> BarListResponse:
    run = storage_client.get_run(run_id=run_id, user_id=user_id)
    if run is None:
        errors.raise_not_found(f"run {run_id} not found")

    rows = storage_client.list_bars(
        range_start=str(run["range_start"]),
        range_end=str(run["range_end"]),
    )
    return BarListResponse(bars=[BarView.model_validate(r) for r in rows])


class RunPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    is_favorite: bool


@router.patch("/runs/{run_id}", response_model=RunView)
def patch_run(
    run_id: UUID,
    body: RunPatchRequest = Body(...),
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> RunView:
    if storage_client.get_run(run_id=run_id, user_id=user_id) is None:
        errors.raise_not_found(f"run {run_id} not found")
    updated = storage_client.update_run_favorite(
        run_id=run_id, user_id=user_id, is_favorite=body.is_favorite
    )
    return RunView(**updated)


@router.delete("/runs/{run_id}")
def delete_run(
    run_id: UUID,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> dict:
    if storage_client.get_run(run_id=run_id, user_id=user_id) is None:
        errors.raise_not_found(f"run {run_id} not found")
    storage_client.delete_run(run_id=run_id, user_id=user_id)
    return {"deleted": str(run_id)}


@router.delete("/runs")
def delete_all_runs(
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> dict:
    count = storage_client.delete_all_runs(user_id=user_id)
    return {"deleted_count": count}


@router.get("/runs/{run_id}/manifest", response_model=RunManifestView)
def get_manifest(
    run_id: UUID,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> RunManifestView:
    run = storage_client.get_run(run_id=run_id, user_id=user_id)
    if run is None:
        errors.raise_not_found(f"run {run_id} not found")

    strategy_row = storage_client.get_strategy_by_id(strategy_id=run["strategy_id"])
    if strategy_row is None:
        errors.raise_not_found(f"strategy {run['strategy_id']} not found")
    config_row = storage_client.get_config_by_id(config_id=run["config_id"], user_id=user_id)
    if config_row is None:
        errors.raise_not_found(f"config {run['config_id']} not found")

    # Prefer the per-run config snapshot (the knobs this run actually executed
    # with) over the shared, mutable live config. Legacy runs predating the
    # snapshot fall back to the live config.
    config_data = dict(config_row)
    snapshot = run.get("config_snapshot")
    if snapshot:
        config_data["params"] = snapshot

    return RunManifestView(
        strategy=StrategyView(**strategy_row),
        config=ConfigView(**config_data),
    )
