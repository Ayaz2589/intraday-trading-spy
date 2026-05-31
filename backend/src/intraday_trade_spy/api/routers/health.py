"""GET /healthz — liveness + DB-reachability probe.

Unauthenticated by design (deployment platforms hit it). Returns 200 when
the service is up and a SELECT 1 against Supabase succeeded; 503 when the
service is up but the DB is unreachable.
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Response

from intraday_trade_spy.api.schemas import HealthResponse


router = APIRouter()


@router.get("/healthz", response_model=HealthResponse)
def healthz(response: Response) -> HealthResponse:
    url = os.environ.get("SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not service_role_key:
        response.status_code = 503
        return HealthResponse(status="ok", db="unreachable")

    try:
        from intraday_trade_spy.storage import SupabaseStorageClient

        # Use a sentinel user_id; we don't actually scope by user for the probe.
        client = SupabaseStorageClient(
            url=url,
            service_role_key=service_role_key,
            user_id="00000000-0000-0000-0000-000000000000",
        )
        client.health_check(timeout_s=5.0)
    except Exception:
        response.status_code = 503
        return HealthResponse(status="ok", db="unreachable")

    return HealthResponse(status="ok", db="ok")
