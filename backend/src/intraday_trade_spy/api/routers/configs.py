"""Config management endpoints (Feature 012): list / create / duplicate /
rename+edit / delete / activate / presets."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, ConfigDict

from intraday_trade_spy.api import errors
from intraday_trade_spy.api.deps import auth_user_id, get_storage_client
from intraday_trade_spy.api.schemas import (
    ConfigCreateRequest,
    ConfigDuplicateRequest,
    ConfigMutateRequest,
    ConfigView,
    PresetListResponse,
    PresetView,
)
from intraday_trade_spy.storage.client import ConfigNameConflict, LastConfigError
from intraday_trade_spy.storage.exceptions import SchemaError

router = APIRouter()


class ConfigListResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    configs: list[ConfigView]


def _scratch_params() -> dict:
    """Sane starting knobs for a from-scratch config = the shipped (workable)
    default's risk/strategy/market blocks."""
    from intraday_trade_spy.config import build_effective_config

    cfg = build_effective_config({})
    return {
        "risk": cfg.risk.model_dump(mode="json"),
        "strategy": cfg.strategy.model_dump(mode="json"),
        "market": cfg.market.model_dump(mode="json"),
    }


@router.get("/configs", response_model=ConfigListResponse)
def list_configs(
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> ConfigListResponse:
    rows = storage_client.list_configs(user_id=user_id)
    return ConfigListResponse(configs=[ConfigView.model_validate(r) for r in rows])


@router.get("/configs/presets", response_model=PresetListResponse)
def list_presets(
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> PresetListResponse:
    return PresetListResponse(
        presets=[PresetView.model_validate(p) for p in storage_client.list_presets()]
    )


@router.post("/configs", response_model=ConfigView, status_code=201)
def create_config(
    body: ConfigCreateRequest,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> ConfigView:
    try:
        if body.source == "preset":
            presets = {p["name"]: p for p in storage_client.list_presets()}
            preset = presets.get(body.preset_name)
            if preset is None:
                errors.raise_not_found(f"preset '{body.preset_name}' not found")
            row = storage_client.create_config(
                name=body.name, params=preset["params"], description=body.description
            )
        elif body.source == "duplicate":
            row = storage_client.duplicate_config(src_id=body.from_config_id, new_name=body.name)
        else:  # scratch (017: explicit params allowed — e.g. a reviewed draft)
            row = storage_client.create_config(
                name=body.name,
                params=body.params if body.params is not None else _scratch_params(),
                description=body.description,
            )
    except ConfigNameConflict as exc:
        errors.raise_validation_error(str(exc))
    except SchemaError as exc:
        errors.raise_not_found(str(exc))
    return ConfigView.model_validate(row)


@router.post("/configs/{config_id}/duplicate", response_model=ConfigView, status_code=201)
def duplicate_config(
    config_id: UUID,
    body: ConfigDuplicateRequest,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> ConfigView:
    try:
        row = storage_client.duplicate_config(src_id=config_id, new_name=body.name)
    except ConfigNameConflict as exc:
        errors.raise_validation_error(str(exc))
    except SchemaError as exc:
        errors.raise_not_found(str(exc))
    return ConfigView.model_validate(row)


@router.post("/configs/{config_id}/activate", response_model=ConfigView)
def activate_config(
    config_id: UUID,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> ConfigView:
    if storage_client.get_config_by_id(config_id=config_id, user_id=user_id) is None:
        errors.raise_not_found(f"config {config_id} not found")
    return ConfigView.model_validate(storage_client.set_active_config(config_id=config_id))


@router.patch("/configs/{config_id}", response_model=ConfigView)
def patch_config(
    config_id: UUID,
    body: ConfigMutateRequest = Body(...),
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> ConfigView:
    existing = storage_client.get_config_by_id(config_id=config_id, user_id=user_id)
    if existing is None:
        errors.raise_not_found(f"config {config_id} not found")
    row = existing
    try:
        if body.name is not None:
            row = storage_client.rename_config(config_id=config_id, new_name=body.name)
        if body.params is not None:
            row = storage_client.update_config(
                config_id=config_id, user_id=user_id, params=body.params
            )
    except ConfigNameConflict as exc:
        errors.raise_validation_error(str(exc))
    return ConfigView.model_validate(row)


@router.delete("/configs/{config_id}")
def delete_config(
    config_id: UUID,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> dict:
    try:
        storage_client.delete_config(config_id=config_id)
    except LastConfigError as exc:
        raise HTTPException(status_code=409, detail={"error": "last_config", "message": str(exc)})
    except SchemaError as exc:
        errors.raise_not_found(str(exc))
    return {"deleted": str(config_id)}
