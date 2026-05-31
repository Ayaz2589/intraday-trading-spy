"""GET /api/strategies — list registered strategies."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from intraday_trade_spy.api.deps import auth_user_id, get_storage_client
from intraday_trade_spy.api.schemas import StrategyListResponse, StrategyView


router = APIRouter()


@router.get("/strategies", response_model=StrategyListResponse)
def list_strategies(
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> StrategyListResponse:
    strategies = storage_client.list_strategies(enabled_only=True)
    return StrategyListResponse(
        strategies=[StrategyView(**row) for row in strategies]
    )
