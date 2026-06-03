"""/api/validation/* — launch + read validation studies (Feature 011)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from intraday_trade_spy.api import errors
from intraday_trade_spy.api.deps import auth_user_id, get_storage_client
from intraday_trade_spy.api.schemas import (
    StartStudyRequest,
    StartStudyResponse,
    StudyListResponse,
    ValidationStudyStatusView,
    ValidationStudyView,
)
from intraday_trade_spy.api.validation_lifecycle import (
    LargeStudyNotConfirmed,
    StudyConfigNotFound,
    start_study,
)

router = APIRouter(prefix="/validation")


@router.post("/studies", response_model=StartStudyResponse, status_code=202)
def start_study_endpoint(
    body: StartStudyRequest,
    background_tasks: BackgroundTasks,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> StartStudyResponse:
    if body.kind == "sensitivity":
        params = {
            "grid": body.grid,
            "metric": body.metric,
            "segment": body.segment or "train",
        }
    else:
        params = {"walk_forward": body.walk_forward} if body.walk_forward else {}
    try:
        study_id, planned = start_study(
            user_id=user_id,
            kind=body.kind,
            config_name=body.config_name,
            params=params,
            confirm_large=body.confirm_large,
            storage=storage_client,
            background_tasks=background_tasks,
        )
    except StudyConfigNotFound:
        errors.raise_config_not_found(body.config_name)
    except LargeStudyNotConfirmed as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "large_study",
                "planned_evaluations": exc.planned,
                "threshold": exc.threshold,
                "hint": "resend with confirm_large=true to proceed",
            },
        )
    except ValueError as exc:
        errors.raise_validation_error(str(exc))
    return StartStudyResponse(study_id=study_id, status="queued", planned_evaluations=planned)


@router.get("/studies", response_model=StudyListResponse)
def list_studies_endpoint(
    limit: int = 50,
    cursor: str | None = None,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> StudyListResponse:
    page = storage_client.list_validation_studies(
        user_id=user_id, limit=max(1, min(limit, 100)), cursor=cursor
    )
    return StudyListResponse(
        studies=[ValidationStudyView.model_validate(s) for s in page.studies],
        next_cursor=page.next_cursor,
    )


@router.get("/studies/{study_id}", response_model=ValidationStudyView)
def get_study_endpoint(
    study_id: UUID,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> ValidationStudyView:
    row = storage_client.get_validation_study(study_id=study_id, user_id=user_id)
    if row is None:
        errors.raise_not_found("validation study not found")
    return ValidationStudyView.model_validate(row)


@router.get("/studies/{study_id}/status", response_model=ValidationStudyStatusView)
def get_study_status_endpoint(
    study_id: UUID,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> ValidationStudyStatusView:
    row = storage_client.get_validation_study(study_id=study_id, user_id=user_id)
    if row is None:
        errors.raise_not_found("validation study not found")
    return ValidationStudyStatusView.model_validate(row)
