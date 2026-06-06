"""POST /api/reset/all — the side-nav Delete-all-data endpoint (factory
reset). Destructive and explicit: wipes the user's research artifacts, the
lockbox ledger, configs, jobs, journal, and the global bar cache; re-seeds a
fresh active 'default' config. The UI gates this behind a destructive
confirm; the backend journals the reset itself."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from intraday_trade_spy.api.deps import auth_user_id, get_storage_client
from intraday_trade_spy.api.schemas import ResetResponse

router = APIRouter(prefix="/reset")


@router.post("/all", response_model=ResetResponse)
def factory_reset_endpoint(
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> ResetResponse:
    return ResetResponse.model_validate(storage_client.factory_reset())
