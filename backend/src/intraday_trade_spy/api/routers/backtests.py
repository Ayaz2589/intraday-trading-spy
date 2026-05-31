"""POST /api/backtests — start a backtest run."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends

from intraday_trade_spy.api import errors
from intraday_trade_spy.api.deps import auth_user_id, get_storage_client
from intraday_trade_spy.api.lifecycle import (
    ConcurrentRunCapExceeded,
    ConfigNotFoundError,
    start_backtest,
)
from intraday_trade_spy.api.schemas import StartBacktestRequest, StartBacktestResponse


router = APIRouter()


@router.post(
    "/backtests",
    response_model=StartBacktestResponse,
    status_code=202,
)
def start_backtest_endpoint(
    body: StartBacktestRequest,
    background_tasks: BackgroundTasks,
    user_id: UUID = Depends(auth_user_id),
    storage_client = Depends(get_storage_client),
) -> StartBacktestResponse:
    try:
        run_id = start_backtest(
            user_id=user_id,
            config_name=body.config_name,
            data_csv_path=body.data_csv_path,
            storage_client=storage_client,
            background_tasks=background_tasks,
        )
    except ConfigNotFoundError:
        errors.raise_config_not_found(body.config_name)
    except ConcurrentRunCapExceeded as exc:
        errors.raise_concurrent_cap(active=exc.active, cap=exc.cap)
    return StartBacktestResponse(run_id=run_id, status="queued")
