"""/api/recommend/* — the DETERMINISTIC recommendation surfaces (Feature 018).

This router is the seeded side of the determinism split (FR-013): health
verdicts and evidence packs are pure functions of persisted state and NEVER
touch the Claude analyst (FR-009). Advisory narration lives on the existing
/api/insights/claude-analysis endpoints with scope='recommend'."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from intraday_trade_spy.api import errors
from intraday_trade_spy.api.claude_analyst import DEFAULT_CONFIG_PATH
from intraday_trade_spy.api.deps import auth_user_id, get_storage_client
from intraday_trade_spy.api.schemas import RecommendHealthResponse, RecommendPackResponse
from intraday_trade_spy.config import load_config
from intraday_trade_spy.recommend.candidates import assemble_recommendation
from intraday_trade_spy.recommend.health import health_for_configs

router = APIRouter(prefix="/recommend")


@router.get("/health", response_model=RecommendHealthResponse)
def recommend_health(
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> RecommendHealthResponse:
    """Per-config health verdicts for every config with OOS history —
    deterministic, cited, recompute-identical (FR-001/FR-002/SC-002)."""
    cfg = load_config(DEFAULT_CONFIG_PATH)
    timeseries = storage_client.insights_edge_timeseries()
    distribution = storage_client.insights_config_distribution()
    configs = storage_client.list_configs(user_id=user_id)
    verdicts = health_for_configs(
        configs=configs,
        points=timeseries.get("points") or [],
        dist_rows=distribution.get("rows") or [],
        thresholds=cfg.insights.health,
    )
    return RecommendHealthResponse.model_validate({"verdicts": verdicts})


@router.get("/pack", response_model=RecommendPackResponse)
def recommend_pack(
    config_id: str,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> RecommendPackResponse:
    """Evidence pack + deterministic ranked candidates for one config —
    assembled exclusively from persisted artifacts (FR-005), no backtests,
    no LLM (FR-009). Recommendations are hypotheses for the validation
    machinery, not results."""
    config = storage_client.get_config_by_id(config_id=config_id, user_id=user_id)
    if config is None:
        errors.raise_not_found(f"config {config_id} not found")
    cfg = load_config(DEFAULT_CONFIG_PATH)
    trial_counts = storage_client.recommendation_trial_counts(
        strategy_id=config.get("strategy_id")
    )
    pack, candidates = assemble_recommendation(
        config=config,
        configs=storage_client.list_configs(user_id=user_id),
        points=(storage_client.insights_edge_timeseries().get("points") or []),
        dist_rows=(storage_client.insights_config_distribution().get("rows") or []),
        surfaces=storage_client.list_sensitivity_surfaces(),
        regimes=[
            {"name": rw.name, "start": rw.start.isoformat(), "end": rw.end.isoformat()}
            for rw in cfg.data.regimes
        ],
        health_thresholds=cfg.insights.health,
        recommend_thresholds=cfg.insights.recommend,
        trial_counts=trial_counts,
    )
    return RecommendPackResponse.model_validate(
        {
            "pack": pack,
            "candidates": candidates,
            "trial_counts": pack["trial_counts"],
            "snapshot_fingerprint": pack["snapshot_fingerprint"],
        }
    )
