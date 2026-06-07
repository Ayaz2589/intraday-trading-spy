"""Default collaborator wiring for campaigns (Feature 019, research.md R3).

Composes the EXISTING machinery in-process — backfill jobs (009/013), the
study lifecycle (011/014), the pooled gate (016) at the tightened bar, and
the deterministic recommendation assembly (018) — into the engine's
`Collaborators`. The engine itself stays pure orchestration; everything
side-effectful lives here and is exercised end-to-end by quickstart T035.
"""

from __future__ import annotations

import copy
from datetime import date, datetime, timedelta
from uuid import uuid4

from intraday_trade_spy.config import Config
from intraday_trade_spy.research.campaign import Collaborators, DataUnavailable


def apply_changes(params: dict, changes: list[dict]) -> dict:
    """A new params dict with each dotted knob path set — never mutates the
    parent (the candidate config is a sibling, not an edit)."""
    out = copy.deepcopy(params or {})
    for change in changes:
        node = out
        *parents, leaf = change["knob_path"].split(".")
        for key in parents:
            node = node.setdefault(key, {})
        node[leaf] = change["value"]
    return out


def _previous_weekday(day: date) -> date:
    out = day - timedelta(days=1)
    while out.weekday() >= 5:  # Sat/Sun
        out -= timedelta(days=1)
    return out


def stale_range(latest_bar_start: str | None, *, full_start: str, today: date):
    """The auto-backfill range (R6): full span when the cache is empty,
    incremental when the newest cached session predates the most recent
    completed weekday session, None when fresh. Weekday-based — a holiday
    may cause one redundant (idempotent) incremental backfill."""
    yesterday = today - timedelta(days=1)
    if latest_bar_start is None:
        return (date.fromisoformat(full_start), yesterday)
    latest_day = datetime.fromisoformat(latest_bar_start.replace("Z", "+00:00")).date()
    if latest_day >= _previous_weekday(today):
        return None
    return (latest_day, yesterday)


class _InlineTasks:
    """A BackgroundTasks stand-in that runs the task immediately — the engine
    already lives in a background task, so its sub-steps run synchronously."""

    def add_task(self, fn, *args, **kwargs):
        fn(*args, **kwargs)


def default_collaborators(*, storage, user_id, cfg: Config) -> Collaborators:
    """The live composition. Closure state carries the config row that
    recommendations were last computed for, so create_config can apply knob
    deltas to the right parent params."""
    from intraday_trade_spy.api.claude_analyst import DEFAULT_CONFIG_PATH  # path const only
    from intraday_trade_spy.api.lifecycle import BackfillRangeError, start_backfill
    from intraday_trade_spy.api.validation_lifecycle import (
        run_pooled_gate_fast,
        run_study_task,
    )
    from intraday_trade_spy.recommend.candidates import assemble_recommendation
    from intraday_trade_spy.validation.walk_forward import plan_walk_forward

    state: dict = {"parent": None}

    def _today() -> date:
        from intraday_trade_spy.api.lifecycle import _today_et

        return _today_et()

    def ensure_data() -> dict:
        coverage = storage.bars_coverage()
        rng = stale_range(
            coverage.get("latest"), full_start=cfg.research.backfill_start, today=_today()
        )
        if rng is None:
            return {"backfill_job_id": None}
        start_d, end_d = rng
        try:
            job_id = start_backfill(
                user_id=user_id, start_date=start_d, end_date=end_d,
                storage_client=storage, background_tasks=_InlineTasks(),
            )
        except BackfillRangeError as exc:
            raise DataUnavailable(f"backfill rejected: {exc.code}") from exc
        job = storage.get_backfill_job(job_id=job_id, user_id=user_id) or {}
        if job.get("status") != "finished":
            raise DataUnavailable(
                f"backfill failed: {job.get('failure_reason') or 'unknown'}"
            )
        return {"backfill_job_id": str(job_id), "range": [str(start_d), str(end_d)]}

    def _run_study_inline(*, kind: str, config_name: str, params: dict | None) -> str:
        cfg_row = storage.get_config_by_name(config_name)
        if cfg_row is None:
            raise RuntimeError(f"config {config_name!r} vanished mid-campaign")
        if kind == "walk_forward":
            planned = plan_walk_forward(cfg, params)
        else:
            from intraday_trade_spy.validation.sweep import planned_evaluations

            planned = planned_evaluations((params or {}).get("grid") or [])
        study_id = str(uuid4())
        storage.insert_validation_study(
            study_id=study_id, kind=kind,
            params={"config_name": config_name, "walk_forward": params},
            progress_total=planned,
        )
        run_study_task(
            study_id=study_id, kind=kind, params=params or {}, storage=storage,
            config_params=cfg_row.get("params"), user_id=user_id,
            config_id=cfg_row.get("id"), strategy_id=cfg_row.get("strategy_id"),
        )
        row = storage.get_validation_study(study_id=study_id, user_id=user_id) or {}
        if row.get("status") != "finished":
            raise RuntimeError(
                f"study {study_id} {row.get('status')}: {row.get('failure_reason')}"
            )
        return study_id

    def run_walk_forward(config_name: str) -> str:
        return _run_study_inline(kind="walk_forward", config_name=config_name, params=None)

    def pooled_gate(*, study_id: str, level: float, bar: dict) -> dict:
        gate = run_pooled_gate_fast(
            study_id=study_id, user_id=user_id, storage=storage,
            base_cfg=cfg, alpha_override=1.0 - level, bar=bar,
        )
        return {
            "passed": bool(gate.passed),
            "ci_low": gate.expectancy_dollars_ci.low,
            "ci_high": gate.expectancy_dollars_ci.high,
        }

    def next_candidates(config_name: str) -> list[dict]:
        config = storage.get_config_by_name(config_name)
        if config is None:
            raise RuntimeError(f"config {config_name!r} vanished mid-campaign")
        state["parent"] = config
        _, candidates = assemble_recommendation(
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
            trial_counts=storage.recommendation_trial_counts(
                strategy_id=config.get("strategy_id")
            ),
        )
        return candidates

    def run_gather_study(spec: dict) -> str:
        parent = state["parent"] or {}
        return _run_study_inline(
            kind=spec.get("kind", "sensitivity"),
            config_name=parent.get("name", ""),
            params={k: v for k, v in spec.items() if k != "kind"},
        )

    def create_config(name: str, changes: list[dict]) -> dict:
        parent = state["parent"] or {}
        params = apply_changes(parent.get("params") or {}, changes)
        return storage.create_config(
            name=name, params=params, strategy_id=parent.get("strategy_id"),
            description="auto-research candidate (campaign-drafted)",
        )

    # DEFAULT_CONFIG_PATH imported for parity with the routers' config source;
    # cfg is already loaded by the caller from the same path.
    _ = DEFAULT_CONFIG_PATH
    return Collaborators(
        ensure_data=ensure_data,
        run_walk_forward=run_walk_forward,
        pooled_gate=pooled_gate,
        next_candidates=next_candidates,
        run_gather_study=run_gather_study,
        create_config=create_config,
    )
