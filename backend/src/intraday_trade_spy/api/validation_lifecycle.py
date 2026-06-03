"""Background-task runner for validation studies (Feature 011, FR-006).

`run_study_task` is enqueued via FastAPI BackgroundTasks at launch. It loads the
train+validation pool bars ONCE, builds the engine, and delegates to the
orchestrator (which owns the running→finished/failed transitions). As a
background task it never raises to the caller — failures are logged and the
study is marked failed. `_df`/`_engine` are injectable for unit tests.
"""

from __future__ import annotations

import logging
import os
from uuid import uuid4

from intraday_trade_spy.config import Config, WalkForwardConfig, build_effective_config, load_config
from intraday_trade_spy.validation.split import assert_no_lockbox_overlap, segments as _segments
from intraday_trade_spy.validation.study import run_walk_forward_study
from intraday_trade_spy.validation.window import enumerate_windows

_log = logging.getLogger(__name__)

DEFAULT_CONFIG_PATH = "config/config.yaml"


class StudyConfigNotFound(Exception):
    def __init__(self, name: str) -> None:
        self.name = name
        super().__init__(name)


class LargeStudyNotConfirmed(Exception):
    def __init__(self, planned: int, threshold: int) -> None:
        self.planned = planned
        self.threshold = threshold
        super().__init__(f"planned {planned} > threshold {threshold}")


def _build_walk_forward(cfg: Config, params: dict | None) -> WalkForwardConfig:
    base = cfg.validation.walk_forward.model_dump()
    override = (params or {}).get("walk_forward") or {}
    return WalkForwardConfig(**{**base, **override})


def plan_walk_forward(cfg: Config, params: dict | None) -> int:
    """Planned evaluation count = 2 × windows (one IS + one OOS each). Also
    asserts the pool never overlaps the lockbox."""
    segs = _segments(cfg)
    pool = segs.train_validation
    assert_no_lockbox_overlap(pool.start, pool.end, segs)
    windows = enumerate_windows(pool, _build_walk_forward(cfg, params))
    return 2 * len(windows)


def start_study(
    *,
    user_id,
    kind: str,
    config_name: str,
    params: dict | None,
    confirm_large: bool,
    storage,
    background_tasks,
    base_cfg: Config | None = None,
):
    """Validate + enqueue a study. Returns (study_id, planned_evaluations).
    Raises StudyConfigNotFound / LargeStudyNotConfirmed / ValueError."""
    cfg = base_cfg or load_config(DEFAULT_CONFIG_PATH)
    if storage.get_config_by_name(config_name) is None:
        raise StudyConfigNotFound(config_name)
    if kind != "walk_forward":
        raise ValueError(f"unsupported study kind: {kind!r}")

    planned = plan_walk_forward(cfg, params)
    if planned > cfg.validation.max_evaluations_warn and not confirm_large:
        raise LargeStudyNotConfirmed(planned, cfg.validation.max_evaluations_warn)

    study_id = str(uuid4())
    storage.insert_validation_study(
        study_id=study_id,
        kind=kind,
        params={"config_name": config_name, "walk_forward": params},
        progress_total=planned,
    )
    cfg_row = storage.get_config_by_name(config_name) or {}
    config_params = cfg_row.get("params") if isinstance(cfg_row, dict) else None
    background_tasks.add_task(
        run_study_task,
        study_id=study_id,
        kind=kind,
        params=params or {},
        storage=storage,
        config_params=config_params,
    )
    return study_id, planned


def run_study_task(
    *,
    study_id,
    kind: str,
    params: dict | None,
    storage,
    cfg: Config | None = None,
    config_params: dict | None = None,
    _df=None,
    _engine=None,
) -> None:
    try:
        if kind != "walk_forward":
            # sensitivity (US2) / lockbox (US4) wire in later phases.
            raise ValueError(f"unsupported study kind: {kind!r}")

        if cfg is None:
            # Built in the background (defers effective-config assembly off the
            # request path); user knobs over the base config.yaml.
            cfg = build_effective_config(config_params or {}, base_path=DEFAULT_CONFIG_PATH)

        segs = _segments(cfg)
        wf = _build_walk_forward(cfg, params)

        engine = _engine
        if engine is None:
            from intraday_trade_spy.backtest.engine import BacktestEngine

            engine = BacktestEngine(cfg)

        df = _df
        if df is None:
            # Load the full train+validation pool ONCE; run_walk_forward slices
            # it per window (parse-once optimization, FR-024).
            from intraday_trade_spy.api.lifecycle import materialize_bars_csv
            from intraday_trade_spy.data.loader import load_bars

            pool = segs.train_validation
            csv_path = materialize_bars_csv(
                storage_client=storage, start=pool.start, end=pool.end
            )
            df = load_bars(csv_path, market=cfg.market)

        run_walk_forward_study(
            study_id=study_id, df=df, segments=segs, wf=wf, engine=engine, storage=storage
        )
    except Exception as exc:  # noqa: BLE001 — background task: log + mark failed, never raise
        _log.exception("run_study_task failed for study %s", study_id)
        try:
            storage.update_validation_study(
                study_id=study_id, status="failed", failure_reason=str(exc)
            )
        except Exception:  # noqa: BLE001
            _log.exception("run_study_task: could not mark study %s failed", study_id)


def sweep_stale_studies(max_age_minutes: int | None = None, *, client=None) -> int:
    """Reap validation studies stuck in 'running' past the TTL (crash recovery).
    Mirrors lifecycle.sweep_stale_runs; `client` injectable for tests."""
    if client is None:
        if not (
            os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        ):
            _log.warning("sweep_stale_studies: SUPABASE_* not set; skipping")
            return 0
        from intraday_trade_spy.storage.client import SupabaseStorageClient

        client = SupabaseStorageClient.from_env()
    kwargs = {} if max_age_minutes is None else {"max_age_minutes": max_age_minutes}
    return client.sweep_stale_studies(**kwargs)
