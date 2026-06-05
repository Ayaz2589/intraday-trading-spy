"""/api/insights/* — cross-run aggregates over the OOS child-run archive
(Feature 016). US3 adds the Claude analysis + settings endpoints here."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response

from intraday_trade_spy.api import errors
from intraday_trade_spy.api.claude_analyst import (
    ClaudeBadRequest,
    ClaudeParseFailure,
    ClaudePaused,
    ClaudeTransient,
    ClaudeUnconfigured,
    get_claude_settings,
    run_claude_analysis,
    set_claude_enabled,
)
from intraday_trade_spy.api.deps import auth_user_id, get_storage_client
from intraday_trade_spy.api.schemas import (
    ClaudeAnalysisRequest,
    ClaudeSettingsPatch,
    ConfigDistributionResponse,
    EdgeTimeseriesResponse,
    InsightSettingsView,
    StoredAnalysisView,
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


@router.post("/claude-analysis", response_model=StoredAnalysisView)
def claude_analysis_post(
    body: ClaudeAnalysisRequest,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> StoredAnalysisView:
    """Generate (or return the stored) advisory analysis. Idempotent by
    payload hash — an unchanged snapshot never re-bills (FR-010)."""
    try:
        out = run_claude_analysis(
            scope=body.scope,
            scope_id=body.scope_id,
            force=body.force,
            user_id=user_id,
            storage=storage_client,
        )
        return StoredAnalysisView.model_validate(out)
    except ClaudeBadRequest as exc:
        errors.raise_validation_error(exc.reason)
    except ClaudePaused as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "claude_paused",
                "disabled_reason": exc.disabled_reason,
                "hint": "top up at console.anthropic.com → Plans & Billing, then re-enable"
                if exc.disabled_reason == "billing"
                else "re-enable Claude analysis in the panel",
            },
        )
    except ClaudeUnconfigured:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "claude_unconfigured",
                "message": "set ANTHROPIC_API_KEY on the backend to enable Claude analysis",
            },
        )
    except ClaudeParseFailure:
        raise HTTPException(
            status_code=502,
            detail={"error": "claude_parse_failure",
                    "message": "Claude returned an unparseable analysis — try again"},
        )
    except ClaudeTransient as exc:
        raise HTTPException(
            status_code=502,
            detail={"error": "claude_transient", "message": str(exc)},
        )


@router.get("/claude-analysis", response_model=StoredAnalysisView | None)
def claude_analysis_get(
    scope: str,
    scope_id: UUID | None = None,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
):
    """Latest stored analysis for a scope (204 if none). Readable regardless
    of paused state — you lose generation, not history."""
    row = storage_client.get_latest_insight_analysis(
        user_id=user_id, scope=scope, scope_id=scope_id
    )
    if row is None:
        return Response(status_code=204)
    return StoredAnalysisView.model_validate({**row, "truncated": bool((row.get("analysis") or {}).get("truncated", False))})


@router.get("/claude-settings", response_model=InsightSettingsView)
def claude_settings_get(
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> InsightSettingsView:
    return InsightSettingsView.model_validate(
        get_claude_settings(user_id=user_id, storage=storage_client)
    )


@router.patch("/claude-settings", response_model=InsightSettingsView)
def claude_settings_patch(
    body: ClaudeSettingsPatch,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> InsightSettingsView:
    """The manual pause/enable toggle (FR-012); enabling clears the reason."""
    return InsightSettingsView.model_validate(
        set_claude_enabled(enabled=body.enabled, user_id=user_id, storage=storage_client)
    )
