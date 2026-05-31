"""POST /api/data/download + GET /api/data/downloads/{id}."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends

from intraday_trade_spy.api import errors
from intraday_trade_spy.api.deps import auth_user_id, get_storage_client
from intraday_trade_spy.api.lifecycle import (
    ConcurrentRunCapExceeded,
    start_data_download,
)
from intraday_trade_spy.api.schemas import (
    DataDownloadJobView,
    StartDataDownloadRequest,
    StartDataDownloadResponse,
)


router = APIRouter()


@router.post(
    "/data/download",
    response_model=StartDataDownloadResponse,
    status_code=202,
)
def start_download(
    body: StartDataDownloadRequest,
    background_tasks: BackgroundTasks,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> StartDataDownloadResponse:
    try:
        job_id = start_data_download(
            user_id=user_id,
            start_date=body.start_date,
            end_date=body.end_date,
            storage_client=storage_client,
            background_tasks=background_tasks,
        )
    except ConcurrentRunCapExceeded as exc:
        errors.raise_download_cap(active=exc.active, cap=exc.cap)
    return StartDataDownloadResponse(job_id=job_id, status="queued")


@router.get("/data/downloads/{job_id}", response_model=DataDownloadJobView)
def get_download_status(
    job_id: UUID,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> DataDownloadJobView:
    row = storage_client.get_data_download_job(job_id=job_id, user_id=user_id)
    if row is None:
        errors.raise_not_found(f"download job {job_id} not found")
    return DataDownloadJobView(**row)
