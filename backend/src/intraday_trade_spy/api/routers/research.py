"""Feature 019 — /api/research/campaigns (contracts/research-api.md).

Start / list / detail / cancel for auto-research campaigns, plus the startup
reconciler. The engine runs as a BackgroundTask (the studies lifecycle
pattern); GETs are pure reads of the persisted row. Campaign thresholds are
frozen from config.yaml at launch so verdicts stay reproducible (SC-005).
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from intraday_trade_spy.api.claude_analyst import DEFAULT_CONFIG_PATH
from intraday_trade_spy.api.deps import auth_user_id, get_storage_client
from intraday_trade_spy.api.schemas import (
    CampaignCancelResponse,
    CampaignListResponse,
    CampaignView,
    StartCampaignRequest,
)
from intraday_trade_spy.config import load_config
from intraday_trade_spy.storage.client import CampaignAlreadyRunning

router = APIRouter(prefix="/research")


def _trials_used(row: dict) -> int:
    """Candidates tried = act stages that created a draft (knob_delta)."""
    n = 0
    for cycle in row.get("cycles") or []:
        for stage in cycle.get("stages") or []:
            if stage.get("stage") == "act" and (
                (stage.get("detail") or {}).get("action") == "knob_delta"
            ):
                n += 1
    return n


def _view(row: dict) -> CampaignView:
    return CampaignView.model_validate({**row, "trials_used": _trials_used(row)})


def run_campaign_task(*, campaign: dict, user_id, storage) -> None:
    """BackgroundTask body: wire the live collaborators and run the engine.
    Module-level so tests can stub it out. Fail-soft even OUTSIDE the engine
    (config load / collaborator wiring): any exception halts the campaign
    failed-with-reason — never a phantom 'running' row (FR-011)."""
    try:
        from intraday_trade_spy.research.campaign import run_campaign
        from intraday_trade_spy.research.wiring import default_collaborators

        cfg = load_config(DEFAULT_CONFIG_PATH)
        run_campaign(
            storage=storage,
            campaign=campaign,
            base_alpha=float((campaign.get("thresholds") or {}).get(
                "base_alpha", cfg.research.base_alpha
            )),
            collab=default_collaborators(storage=storage, user_id=user_id, cfg=cfg),
        )
    except Exception as exc:  # noqa: BLE001 — last-resort halt (study-task precedent)
        import logging

        logging.getLogger(__name__).exception("campaign task crashed: %s", exc)
        storage.halt_research_campaign(
            campaign_id=campaign["id"], status="failed", verdict="failed",
            verdict_detail={"reason": f"campaign task crashed: {exc}"},
        )


def reconcile_interrupted_campaigns(storage) -> int:
    """Startup reconciler (research.md R3): no phantom 'running' campaigns
    after a restart — they fail explicitly."""
    return int(storage.fail_running_campaigns(reason="service restart") or 0)


@router.post("/campaigns", response_model=CampaignView, status_code=202)
def start_campaign(
    body: StartCampaignRequest,
    background_tasks: BackgroundTasks,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> CampaignView:
    cfg_row = storage_client.get_config_by_name(body.config_name)
    if cfg_row is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "config_not_found",
                    "message": f"config {body.config_name!r} not found"},
        )
    cfg = load_config(DEFAULT_CONFIG_PATH)
    budget = body.budget if body.budget is not None else cfg.research.default_budget
    try:
        row = storage_client.insert_research_campaign(
            strategy_id=cfg_row.get("strategy_id"),
            starting_config_id=cfg_row.get("id"),
            starting_config_name=body.config_name,
            budget=budget,
            thresholds={
                "base_alpha": cfg.research.base_alpha,
                "backfill_start": cfg.research.backfill_start,
            },
        )
    except CampaignAlreadyRunning as exc:
        raise HTTPException(
            status_code=409,
            detail={"error": "campaign_already_running",
                    "message": f"a campaign is already running: {exc}"},
        ) from exc
    background_tasks.add_task(
        run_campaign_task, campaign=row, user_id=user_id, storage=storage_client
    )
    return _view(row)


@router.get("/campaigns", response_model=CampaignListResponse)
def list_campaigns(
    user_id: UUID = Depends(auth_user_id),  # noqa: ARG001 — storage is user-scoped
    storage_client=Depends(get_storage_client),
) -> CampaignListResponse:
    cfg = load_config(DEFAULT_CONFIG_PATH)
    rows = storage_client.list_research_campaigns()
    return CampaignListResponse.model_validate({
        "campaigns": [_view(r).model_dump() for r in rows],
        "default_budget": cfg.research.default_budget,
    })


@router.get("/campaigns/{campaign_id}", response_model=CampaignView)
def get_campaign(
    campaign_id: UUID,
    user_id: UUID = Depends(auth_user_id),  # noqa: ARG001
    storage_client=Depends(get_storage_client),
) -> CampaignView:
    row = storage_client.get_research_campaign(campaign_id=str(campaign_id))
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "campaign_not_found",
                    "message": f"campaign {campaign_id} not found"},
        )
    return _view(row)


@router.post("/campaigns/{campaign_id}/cancel", response_model=CampaignCancelResponse)
def cancel_campaign(
    campaign_id: UUID,
    user_id: UUID = Depends(auth_user_id),  # noqa: ARG001
    storage_client=Depends(get_storage_client),
) -> CampaignCancelResponse:
    if not storage_client.request_campaign_cancel(campaign_id=str(campaign_id)):
        raise HTTPException(
            status_code=409,
            detail={"error": "not_running",
                    "message": "the campaign is not running"},
        )
    return CampaignCancelResponse(cancel_requested=True)
