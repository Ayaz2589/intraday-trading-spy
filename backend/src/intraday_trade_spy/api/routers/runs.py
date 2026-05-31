"""GET /api/runs[/{id}[/status|/trades|/signals|/journal]]."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from intraday_trade_spy.api import errors
from intraday_trade_spy.api.deps import auth_user_id, get_storage_client
from intraday_trade_spy.api.pagination import decode_cursor
from intraday_trade_spy.api.schemas import (
    JournalListResponse,
    RunListResponse,
    RunStatusResponse,
    RunView,
    SignalListResponse,
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
