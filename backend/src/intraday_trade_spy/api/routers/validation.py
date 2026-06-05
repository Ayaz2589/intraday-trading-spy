"""/api/validation/* — launch + read validation studies (Feature 011)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import JSONResponse

from intraday_trade_spy.api import errors
from intraday_trade_spy.api.deps import auth_user_id, get_storage_client
from intraday_trade_spy.api.schemas import (
    LockboxRunRequest,
    LockboxRunResponse,
    LockboxStatusView,
    MonteCarloRequest,
    PooledGateRequest,
    SignificanceRequest,
    StartStudyRequest,
    StartStudyResponse,
    StudyListResponse,
    StudyRerunResponse,
    ValidationStudyStatusView,
    ValidationStudyView,
)
from intraday_trade_spy.api.validation_lifecycle import (
    LargeStudyNotConfirmed,
    LockboxAlreadySpent,
    MonteCarloNotComputable,
    PooledGateAlreadyRunning,
    PooledGateNotComputable,
    RunNotFound,
    StudyConfigNotFound,
    StudyNotFound,
    get_lockbox_status_view,
    rerun_study,
    run_lockbox,
    run_monte_carlo_for_run,
    run_pooled_gate_fast,
    run_significance_for_run,
    start_pooled_gate_full,
    start_study,
)
from intraday_trade_spy.models import MonteCarloResult, SignificanceResult

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


@router.post("/significance", response_model=SignificanceResult)
def significance_endpoint(
    body: SignificanceRequest,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> SignificanceResult:
    try:
        return run_significance_for_run(
            run_id=body.run_id, user_id=user_id, storage=storage_client
        )
    except RunNotFound:
        errors.raise_not_found("run not found")


@router.post("/monte-carlo", response_model=MonteCarloResult)
def monte_carlo_endpoint(
    body: MonteCarloRequest,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> MonteCarloResult:
    """Feature 015: on-demand, deterministic, never persisted — the response's
    seed/iterations/trade_count regenerate every number exactly."""
    try:
        return run_monte_carlo_for_run(
            run_id=body.run_id, user_id=user_id, storage=storage_client
        )
    except RunNotFound:
        errors.raise_not_found("run not found")
    except MonteCarloNotComputable as exc:
        errors.raise_validation_error(exc.reason)


@router.post("/studies/{study_id}/pooled-gate", response_model=None)
def pooled_gate_endpoint(
    study_id: UUID,
    body: PooledGateRequest,
    background_tasks: BackgroundTasks,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
):
    """Feature 016: the pre-registered lockbox gate over a walk-forward
    study's pooled OOS windows. fast = sync verdict (200); full = background
    per-window permutation tests + Fisher (202; completion signaled solely by
    result.pooled_gate.mode == 'full')."""
    try:
        if body.mode == "full":
            start_pooled_gate_full(
                study_id=study_id, user_id=user_id,
                storage=storage_client, background_tasks=background_tasks,
            )
            return JSONResponse(
                status_code=202,
                content={"study_id": str(study_id), "status": "running"},
            )
        return run_pooled_gate_fast(
            study_id=study_id, user_id=user_id, storage=storage_client
        )
    except StudyNotFound:
        errors.raise_not_found("validation study not found")
    except PooledGateNotComputable as exc:
        errors.raise_validation_error(exc.reason)
    except PooledGateAlreadyRunning:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "pooled_gate_running",
                "hint": "a full gate is already computing for this study",
            },
        )


@router.get("/lockbox", response_model=LockboxStatusView)
def lockbox_status_endpoint(
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> LockboxStatusView:
    return LockboxStatusView.model_validate(
        get_lockbox_status_view(user_id=user_id, storage=storage_client)
    )


@router.post("/lockbox/run", response_model=LockboxRunResponse)
def lockbox_run_endpoint(
    body: LockboxRunRequest,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> LockboxRunResponse:
    try:
        out = run_lockbox(
            user_id=user_id, config_name=body.config_name, override=body.override,
            storage=storage_client,
        )
    except StudyConfigNotFound:
        errors.raise_config_not_found(body.config_name)
    except LockboxAlreadySpent as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "lockbox_already_spent",
                "spent_fingerprint": exc.spent_fingerprint,
                "spent_run_id": str(exc.spent_run_id) if exc.spent_run_id else None,
                "hint": "the lockbox is one-shot; pass override=true to deliberately burn it",
            },
        )
    return LockboxRunResponse.model_validate(out)


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


@router.post(
    "/studies/{study_id}/rerun", response_model=StudyRerunResponse, status_code=202
)
def rerun_study_endpoint(
    study_id: UUID,
    background_tasks: BackgroundTasks,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> StudyRerunResponse:
    """Feature 014 (FR-010): clone a study's kind + config + params into a
    brand-new study (full child persistence applies). 404 unknown study;
    a since-deleted config surfaces the existing config-not-found error."""
    try:
        new_id, planned = rerun_study(
            study_id=study_id,
            user_id=user_id,
            storage=storage_client,
            background_tasks=background_tasks,
        )
    except StudyNotFound:
        errors.raise_not_found("validation study not found")
    except StudyConfigNotFound as exc:
        errors.raise_config_not_found(exc.name)
    except ValueError as exc:
        errors.raise_validation_error(str(exc))
    return StudyRerunResponse(study_id=new_id, planned_evaluations=planned)
