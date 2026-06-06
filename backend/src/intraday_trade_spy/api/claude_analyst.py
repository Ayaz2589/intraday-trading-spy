"""Advisory Claude narrative (Feature 016).

One responsibility: gather payload -> call Claude -> validate -> store. All
Anthropic SDK awareness lives HERE — the rest of the system sees only the
exception taxonomy and stored-analysis dicts.

Boundaries (Principle II / FR-013): strictly advisory, manual trigger only,
no write path into strategies/configs/risk/orders. Analyses are pinned to
the payload hash they were generated from (idempotent: unchanged hash ->
return stored, no provider call) and stored immutably in insight_analyses.
"""

from __future__ import annotations

import hashlib
import json
import os

import anthropic

from intraday_trade_spy.config import Config, load_config
from intraday_trade_spy.models import ClaudeAnalysis
from intraday_trade_spy.validation.knobs import registry_prompt_section, sanitize_changes

DEFAULT_CONFIG_PATH = os.environ.get(
    "INTRADAY_CONFIG_PATH", os.path.join(os.path.dirname(__file__), "..", "..", "..", "config", "config.yaml")
)

# Stable, cache-marked system prompt: skeptical-analyst persona + the app's
# methodology glossary + the advisory-only boundary. NOTE: Opus minimum
# cacheable prefix is 4096 tokens — below that the marker silently no-ops
# (accepted; pennies at this volume).
SYSTEM_PROMPT = """You are a skeptical quantitative research analyst reviewing results from a
single-operator SPY intraday trading research application. Your role is
strictly ADVISORY: you read already-computed statistics and offer perspective.
You never generate trade signals, never tune parameters, and never instruct
the operator to trade. Challenge the data; do not cheerlead.

Methodology glossary (as used by this application):
- Walk-forward study: rolling train/validation windows over 2018-2026 SPY
  5-minute bars; each out-of-sample (OOS) window is a real, persisted run.
- Pooled gate: the pre-registered lockbox precondition. All OOS windows'
  trades are pooled; the gate passes only if the bootstrap 95% CI on pooled
  expectancy ($/trade) strictly excludes zero.
- Sign test: one-sided binomial on the count of positive windows.
- Fisher's combined p: combines per-window permutation p-values; a tiny value
  with a failing pooled CI means a real but regime-dependent edge.
- Monte Carlo path risk: reshuffles/resamples real trades — drawdown
  distributions, forward cone, risk of ruin. Seeded and reproducible.
- Lockbox: a held-out final slice, spendable exactly once, only after the
  pooled gate passes.

Output discipline:
- Every finding MUST cite the payload metric backing it in evidence_metric,
  using the metric's key path exactly as it appears in the payload.
- Quote numbers only from the payload; never invent or recompute statistics.
- suggested_experiments are research actions for the operator (config
  changes to test, studies to run) — never trades to place.
- Be direct about weaknesses, overfitting risk, and what the data cannot say.
""" + "\n" + registry_prompt_section()
# Feature 017: the tunable-knob section is generated FROM the registry so
# prompt and enforcement cannot drift (research R5). Enforcement never relies
# on the model complying (FR-010) — see _sanitize_experiments.


# ---- exception taxonomy --------------------------------------------------------


class ClaudeBadRequest(Exception):
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


class ClaudePaused(Exception):
    def __init__(self, disabled_reason: str | None):
        self.disabled_reason = disabled_reason
        super().__init__(f"claude analysis paused ({disabled_reason})")


class ClaudeUnconfigured(Exception):
    pass


class ClaudeTransient(Exception):
    pass


class ClaudeParseFailure(Exception):
    pass


# ---- client --------------------------------------------------------------------

_client: anthropic.Anthropic | None = None


def _get_client(cfg: Config | None = None) -> anthropic.Anthropic:
    """Lazy module singleton. Missing key -> unconfigured (graceful
    degradation: the rest of the app works without it)."""
    global _client
    if _client is not None:
        return _client
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise ClaudeUnconfigured()
    _client = anthropic.Anthropic()
    return _client


def is_configured() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


# ---- payload builders ------------------------------------------------------------


def payload_hash(payload: dict) -> str:
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(blob.encode()).hexdigest()


def build_insights_payload(*, timeseries: dict, distribution: dict, max_windows: int) -> dict:
    """Cross-run scope: edge time-series + config distribution. Oversized
    archives truncate to the most-recent windows, disclosed via `truncated`."""
    points = list(timeseries.get("points") or [])
    truncated = len(points) > max_windows
    if truncated:
        points = sorted(points, key=lambda p: str(p.get("range_start")))[-max_windows:]
    return {
        "scope": "insights",
        "analysis_schema_version": 2,
        "timeseries": {"points": points},
        "distribution": {"rows": distribution.get("rows") or []},
        "fingerprints": {
            "timeseries": timeseries.get("snapshot_fingerprint"),
            "distribution": distribution.get("snapshot_fingerprint"),
        },
        "truncated": truncated,
    }


def build_recommend_payload(*, pack: dict, candidates: list[dict]) -> dict:
    """Feature 018: the evidence pack + the DETERMINISTIC ranked candidates.
    Claude comments on and ranks provided candidates — it never invents
    settings; sanitation (FR-010) still never relies on compliance."""
    return {
        "scope": "recommend",
        "analysis_schema_version": 2,
        "pack": pack,
        "candidates": candidates,
        "trial_counts": pack.get("trial_counts"),
        "fingerprints": {"pack": pack.get("snapshot_fingerprint")},
        "truncated": False,
    }


def build_study_payload(*, study: dict) -> dict:
    """Study scope: the computed gate + per-window table + params. Refuses
    studies whose gate hasn't been computed (nothing to analyze)."""
    result = study.get("result") or {}
    gate = result.get("pooled_gate")
    if not gate:
        raise ClaudeBadRequest(
            "this study has no computed pooled gate yet — run the gate first, "
            "then ask for Claude's read"
        )
    return {
        "scope": "study",
        "analysis_schema_version": 2,
        "study_id": str(study.get("id")),
        "params": study.get("params") or {},
        "pooled_gate": gate,
        "windows": result.get("windows") or [],
        "fingerprints": {"gate_computed_at": gate.get("computed_at")},
        "truncated": False,
    }


# ---- settings --------------------------------------------------------------------


def get_claude_settings(*, user_id, storage) -> dict:
    row = storage.get_insight_settings(user_id=user_id)
    return {
        "claude_enabled": bool(row.get("claude_enabled", True)),
        "disabled_reason": row.get("disabled_reason"),
        "configured": is_configured(),
    }


def set_claude_enabled(*, enabled: bool, user_id, storage) -> dict:
    storage.update_insight_settings(
        user_id=user_id,
        claude_enabled=enabled,
        disabled_reason=None if enabled else "manual",
    )
    return get_claude_settings(user_id=user_id, storage=storage)


# ---- the run ----------------------------------------------------------------------


def _error_type(exc: Exception) -> str | None:
    t = getattr(exc, "type", None)
    if isinstance(t, str):
        return t
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        return ((body.get("error") or {}).get("type"))
    return None


def _sanitize_experiments(analysis: dict) -> None:
    """Feature 017 (FR-002): drop off-registry / out-of-bounds suggestions
    BEFORE storage so every stored analysis is trustworthy as-is. In place;
    experiments left with nothing render text-only."""
    for exp in analysis.get("suggested_experiments") or []:
        if isinstance(exp, dict):
            exp["suggested_config_changes"] = [
                c.model_dump() for c in sanitize_changes(exp.get("suggested_config_changes"))
            ]


def run_claude_analysis(
    *, scope: str, scope_id, force: bool, user_id, storage, base_cfg: Config | None = None
) -> dict:
    """Generate (or return the stored) advisory analysis for a scope."""
    cfg = base_cfg or load_config(DEFAULT_CONFIG_PATH)

    settings = storage.get_insight_settings(user_id=user_id)
    if not settings.get("claude_enabled", True):
        raise ClaudePaused(settings.get("disabled_reason"))

    if scope == "insights":
        payload = build_insights_payload(
            timeseries=storage.insights_edge_timeseries(),
            distribution=storage.insights_config_distribution(),
            max_windows=cfg.insights.claude.max_timeseries_windows,
        )
        if not payload["timeseries"]["points"]:
            raise ClaudeBadRequest("nothing to analyze yet — the OOS archive is empty")
    elif scope == "study":
        if scope_id is None:
            raise ClaudeBadRequest("study scope requires a scope_id")
        study = storage.get_validation_study(study_id=scope_id, user_id=user_id)
        if study is None:
            raise ClaudeBadRequest("validation study not found")
        payload = build_study_payload(study=study)
    elif scope == "recommend":
        # Feature 018: the evidence pack for one config (scope_id = config id).
        from intraday_trade_spy.recommend.candidates import assemble_recommendation

        if scope_id is None:
            raise ClaudeBadRequest("recommend scope requires a scope_id (config id)")
        config = storage.get_config_by_id(config_id=scope_id, user_id=user_id)
        if config is None:
            raise ClaudeBadRequest("config not found")
        trial_counts = storage.recommendation_trial_counts(
            strategy_id=config.get("strategy_id")
        )
        pack, candidates = assemble_recommendation(
            config=config,
            configs=storage.list_configs(user_id=user_id),
            points=(storage.insights_edge_timeseries().get("points") or []),
            dist_rows=(storage.insights_config_distribution().get("rows") or []),
            surfaces=storage.list_sensitivity_surfaces(),
            regimes=[
                {"name": rw.name, "start": rw.start.isoformat(), "end": rw.end.isoformat()}
                for rw in cfg.data.regimes
            ],
            health_thresholds=cfg.insights.health,
            recommend_thresholds=cfg.insights.recommend,
            trial_counts=trial_counts,
        )
        payload = build_recommend_payload(pack=pack, candidates=candidates)
    else:
        raise ClaudeBadRequest(f"unknown scope '{scope}'")

    digest = payload_hash(payload)
    latest = storage.get_latest_insight_analysis(
        user_id=user_id, scope=scope, scope_id=scope_id
    )
    if latest and latest.get("payload_hash") == digest and not force:
        return {**latest, "truncated": bool(payload.get("truncated"))}

    client = _get_client(cfg)
    try:
        response = client.messages.parse(
            model=cfg.insights.claude.model,
            max_tokens=cfg.insights.claude.max_tokens,
            thinking={"type": "adaptive"},
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Analyze the following research data. Cite payload metric "
                        "key paths in evidence_metric.\n\n"
                        + json.dumps(payload, sort_keys=True, default=str)
                    ),
                }
            ],
            output_format=ClaudeAnalysis,
        )
    except anthropic.AuthenticationError as exc:
        raise ClaudeUnconfigured() from exc
    except anthropic.RateLimitError as exc:
        raise ClaudeTransient("rate limited — try again shortly") from exc
    except anthropic.APIStatusError as exc:
        if _error_type(exc) == "billing_error":
            storage.update_insight_settings(
                user_id=user_id, claude_enabled=False, disabled_reason="billing"
            )
            raise ClaudePaused("billing") from exc
        if exc.status_code >= 500 or _error_type(exc) == "overloaded_error":
            raise ClaudeTransient("provider overloaded — try again shortly") from exc
        raise ClaudeTransient(str(exc)) from exc

    parsed = getattr(response, "parsed_output", None)
    if parsed is None:
        raise ClaudeParseFailure()
    analysis = parsed.model_dump()
    analysis["truncated"] = bool(payload.get("truncated"))
    analysis["fingerprints"] = payload.get("fingerprints") or {}
    _sanitize_experiments(analysis)

    stored = storage.insert_insight_analysis(
        user_id=user_id,
        scope=scope,
        scope_id=str(scope_id) if scope_id is not None else None,
        payload_hash=digest,
        model=cfg.insights.claude.model,
        analysis=analysis,
    )
    return {
        "id": (stored or {}).get("id"),
        "scope": scope,
        "scope_id": str(scope_id) if scope_id is not None else None,
        "payload_hash": digest,
        "model": cfg.insights.claude.model,
        "analysis": analysis,
        "created_at": (stored or {}).get("created_at"),
        "truncated": bool(payload.get("truncated")),
    }
