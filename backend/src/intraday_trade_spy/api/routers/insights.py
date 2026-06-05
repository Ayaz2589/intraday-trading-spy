"""/api/insights/* — cross-run aggregates over the OOS child-run archive
(Feature 016). US3 adds the Claude analysis + settings endpoints here."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from intraday_trade_spy.api.deps import auth_user_id, get_storage_client
from intraday_trade_spy.api.schemas import (
    ConfigDistributionResponse,
    EdgeTimeseriesResponse,
)

router = APIRouter(prefix="/insights")


@router.get("/edge-timeseries", response_model=EdgeTimeseriesResponse)
def edge_timeseries_endpoint(
    config_name: str | None = None,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> EdgeTimeseriesResponse:
    """One point per OOS child run, computed from stored per-trade data
    (FR-005); the fingerprint pins analyses + signals staleness (FR-007)."""
    out = storage_client.insights_edge_timeseries(config_name=config_name)
    return EdgeTimeseriesResponse.model_validate(out)


@router.get("/config-distribution", response_model=ConfigDistributionResponse)
def config_distribution_endpoint(
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> ConfigDistributionResponse:
    """Per-config distribution of per-window OOS outcomes (FR-006)."""
    out = storage_client.insights_config_distribution()
    return ConfigDistributionResponse.model_validate(out)
