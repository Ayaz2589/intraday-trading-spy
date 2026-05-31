"""GET /api/configs + PATCH /api/configs/{id}."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Body, Depends
from pydantic import BaseModel, ConfigDict

from intraday_trade_spy.api import errors
from intraday_trade_spy.api.deps import auth_user_id, get_storage_client
from intraday_trade_spy.api.schemas import ConfigView


router = APIRouter()


class ConfigListResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    configs: list[ConfigView]


class ConfigPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    params: dict


@router.get("/configs", response_model=ConfigListResponse)
def list_configs(
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> ConfigListResponse:
    rows = storage_client.list_configs(user_id=user_id)
    return ConfigListResponse(configs=[ConfigView.model_validate(r) for r in rows])


@router.patch("/configs/{config_id}", response_model=ConfigView)
def patch_config(
    config_id: UUID,
    body: ConfigPatchRequest = Body(...),
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> ConfigView:
    existing = storage_client.get_config_by_id(config_id=config_id, user_id=user_id)
    if existing is None:
        errors.raise_not_found(f"config {config_id} not found")
    updated = storage_client.update_config(
        config_id=config_id, user_id=user_id, params=body.params
    )
    return ConfigView.model_validate(updated)
