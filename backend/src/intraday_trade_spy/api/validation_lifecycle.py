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


class RunNotFound(Exception):
    def __init__(self, run_id: str) -> None:
        self.run_id = run_id
        super().__init__(run_id)


class LockboxAlreadySpent(Exception):
    def __init__(self, spent_fingerprint: str | None, spent_run_id=None) -> None:
        self.spent_fingerprint = spent_fingerprint
        self.spent_run_id = spent_run_id
        super().__init__("lockbox already spent")


# Segment values the runs.segment CHECK accepts (0111). A combined
# train+validation evaluation is stored with segment NULL — the true segment
# label lives in the study's result JSON (analyze I1 / 014 remediation).
_DB_SEGMENTS = {"train", "validation", "lockbox"}


def make_study_persist(
    *,
    storage,
    user_id,
    config_id,
    strategy_id,
    study_id,
    config_params: dict | None,
    base_path: str | None = None,
):
    """Build the per-evaluation persistence callback for a study (Feature 014).

    Returns `persist(result, *, segment, window_index, coords=None) ->
    (run_id, persisted)`. Owns everything the orchestrator must never see:

      - spec-hash dedup (an identical finished run is referenced, not re-pushed)
      - the in-memory payload build + atomic push_run RPC
      - post-push stamping of spec_hash and the per-eval config_snapshot
        (the api/lifecycle.py single-backtest pattern)
      - the train_validation → NULL segment mapping (0111 CHECK)
      - fail-soft error handling: NEVER raises — a persistence failure returns
        (local_run_id, False) and the study's math proceeds untouched (FR-006)
    """
    from intraday_trade_spy.run_spec import compute_spec_hash
    from intraday_trade_spy.storage.push import build_run_payload

    base_params = config_params or {}
    path = base_path or DEFAULT_CONFIG_PATH

    def persist(result, *, segment, window_index, coords=None):
        try:
            from intraday_trade_spy.config import _deep_merge
            from intraday_trade_spy.validation.sweep import dotted_to_nested

            params = (
                _deep_merge(base_params, dotted_to_nested(coords))
                if coords
                else base_params
            )
            fp = result.run.data_fingerprint
            spec_hash = compute_spec_hash(
                strategy_id=str(strategy_id),
                params=params,
                symbol="SPY",
                range_start=fp.earliest_timestamp.date(),
                range_end=fp.latest_timestamp.date(),
            )
            existing = storage.find_finished_run_by_spec(spec_hash=spec_hash)
            if existing is not None:
                return str(existing), True

            run_id = uuid4()
            payload = build_run_payload(
                result,
                user_id=user_id,
                config_id=config_id,
                strategy_id=strategy_id,
                run_id=run_id,
                study_id=study_id,
                segment=segment if segment in _DB_SEGMENTS else None,
                window_index=window_index,
            )
            storage.push_run(payload)
            storage.set_run_spec_hash(run_id=run_id, spec_hash=spec_hash)
            eff = build_effective_config(params, base_path=path)
            storage.set_run_config_snapshot(
                run_id=run_id,
                config_snapshot={
                    "risk": eff.risk.model_dump(mode="json"),
                    "strategy": eff.strategy.model_dump(mode="json"),
                },
            )
            return str(run_id), True
        except Exception as exc:  # noqa: BLE001 — fail-soft: persistence is additive
            _log.exception(
                "study %s: child-run persist failed (segment=%s window=%s): %s",
                study_id, segment, window_index, exc,
            )
            return result.run.run_id, False

    return persist


def get_lockbox_status_view(*, user_id, storage, base_cfg: Config | None = None) -> dict:
    from intraday_trade_spy.validation.lockbox import derive_state
    from intraday_trade_spy.validation.split import segments as _segs

    cfg = base_cfg or load_config(DEFAULT_CONFIG_PATH)
    lb = _segs(cfg).lockbox
    rows = storage.get_lockbox_ledger(
        user_id=user_id, lockbox_start=lb.start, lockbox_end=lb.end
    )
    spending = next((r for r in rows if r.get("state") == "spent"), None)
    return {
        "lockbox_start": lb.start,
        "lockbox_end": lb.end,
        "state": derive_state(rows),
        "config_fingerprint": spending.get("config_fingerprint") if spending else None,
        "run_id": spending.get("run_id") if spending else None,
        "result": spending.get("result") if spending else None,
        "history": [
            {
                "config_fingerprint": r.get("config_fingerprint"),
                "state": r.get("state"),
                "override": r.get("override", False),
                "created_at": r.get("created_at"),
            }
            for r in rows
        ],
    }


def run_lockbox(
    *,
    user_id,
    config_name: str,
    override: bool,
    storage,
    base_cfg: Config | None = None,
    _df=None,
    _engine=None,
) -> dict:
    """The one-shot lockbox test. Enforces the spend/idempotent/block/burn state
    machine, runs the held-out evaluation when allowed, records it immutably, and
    journals the spend/burn (FR-017..019, FR-023)."""
    from datetime import datetime, timezone
    from uuid import uuid4

    from intraday_trade_spy.validation.lockbox import (
        decide_lockbox_action,
        freeze_fingerprint,
    )
    from intraday_trade_spy.validation.split import segments as _segs

    cfg = base_cfg or load_config(DEFAULT_CONFIG_PATH)
    cfg_row = storage.get_config_by_name(config_name)
    if cfg_row is None:
        raise StudyConfigNotFound(config_name)
    params = cfg_row.get("params") if isinstance(cfg_row, dict) else {}
    lb = _segs(cfg).lockbox

    fingerprint = freeze_fingerprint(
        strategy_id=cfg.strategy.enabled_setup,
        params=params or {},
        symbol=cfg.market.symbol,
        lockbox_start=lb.start,
        lockbox_end=lb.end,
    )
    rows = storage.get_lockbox_ledger(
        user_id=user_id, lockbox_start=lb.start, lockbox_end=lb.end
    )
    decision = decide_lockbox_action(rows, fingerprint, override=override)

    if decision.action == "block":
        spent = next((r for r in rows if r.get("state") == "spent"), rows[0])
        raise LockboxAlreadySpent(
            spent_fingerprint=spent.get("config_fingerprint"),
            spent_run_id=spent.get("run_id"),
        )

    if decision.action == "idempotent":
        row = decision.existing_row or {}
        return {
            "state": row.get("state", "spent"),
            "contaminated": row.get("state") == "burned",
            "summary": row.get("result") or {},
            "config_fingerprint": fingerprint,
            "run_id": row.get("run_id"),
        }

    # allow (first spend) or burn (deliberate override) → run the one-shot eval.
    engine = _engine
    if engine is None:
        from intraday_trade_spy.backtest.engine import BacktestEngine

        engine = BacktestEngine(build_effective_config(params or {}, base_path=DEFAULT_CONFIG_PATH))
    df = _df if _df is not None else _materialize_df(storage, cfg, lb.start, lb.end)
    result = engine.run_df(df)
    summary = result.summary.model_dump(mode="json")
    state = decision.state  # 'spent' or 'burned'

    # Feature 014 (FR-003): the one-shot evaluation is itself a drillable run
    # (segment='lockbox', no study parent). Fail-soft: a persistence failure
    # must never block the spend — the append-only ledger row is the critical,
    # immutable record, so it carries run_id=None in that case.
    persist = make_study_persist(
        storage=storage,
        user_id=user_id,
        config_id=cfg_row.get("id") if isinstance(cfg_row, dict) else None,
        strategy_id=cfg_row.get("strategy_id") if isinstance(cfg_row, dict) else None,
        study_id=None,
        config_params=params,
    )
    child_run_id, persisted = persist(result, segment="lockbox", window_index=None)
    run_id = child_run_id if persisted else None

    storage.append_lockbox_row(
        ledger_id=uuid4(), lockbox_start=lb.start, lockbox_end=lb.end,
        config_fingerprint=fingerprint, result=summary, state=state,
        override=(decision.action == "burn"), run_id=run_id,
    )
    storage.insert_journal_event(
        event_id=uuid4(),
        occurred_at=datetime.now(timezone.utc).isoformat(),
        kind="lifecycle",
        severity=("warning" if state == "burned" else "info"),
        message=f"Lockbox {state}",
        details={"event": f"lockbox_{state}", "config_fingerprint": fingerprint,
                 "override": decision.action == "burn"},
    )
    return {
        "state": state,
        "contaminated": state == "burned",
        "summary": summary,
        "config_fingerprint": fingerprint,
        "run_id": run_id,
    }


def _clock_from_cfg(cfg: Config):
    from datetime import time

    from intraday_trade_spy.clock import MarketClock

    m = cfg.market
    return MarketClock(
        session_start=time.fromisoformat(m.session_start),
        session_end=time.fromisoformat(m.session_end),
        no_new_trades_after=time.fromisoformat(m.no_new_trades_after),
        force_flat_time=time.fromisoformat(m.force_flat_time),
    )


def run_significance_for_run(
    *, run_id, user_id, storage, base_cfg: Config | None = None, _bars=None
):
    """Compute significance (bootstrap CIs + random-entry permutation) for a
    completed run. Loads the run's trades for the bootstrap and the run's window
    bars for the null (FR-014 / analyze finding C2). `_bars` injectable for tests."""
    from intraday_trade_spy.broker.paper import PaperBroker
    from intraday_trade_spy.validation.random_entry import random_entry_null
    from intraday_trade_spy.validation.significance import (
        compute_significance,
        extract_trade_stats,
    )

    cfg = base_cfg or load_config(DEFAULT_CONFIG_PATH)
    run_row = storage.get_run(run_id=run_id, user_id=user_id)
    if run_row is None:
        raise RunNotFound(str(run_id))

    page = storage.list_trades(run_id=run_id, user_id=user_id, limit=100000, cursor=None)
    trades = getattr(page, "trades", page) or []
    stats = extract_trade_stats(trades, account_value=cfg.risk.account_value)
    sig_cfg = cfg.validation.significance

    null: list[float] = []
    if stats["n_trades"] > 0 and stats["stop_distance"] > 0:
        bars = _bars
        if bars is None:
            from intraday_trade_spy.data.bars import BarIterator

            def _as_date(v):
                from datetime import date, datetime

                if isinstance(v, date) and not isinstance(v, datetime):
                    return v
                return datetime.fromisoformat(str(v)[:10]).date()

            df = _materialize_df(
                storage, cfg, _as_date(run_row["range_start"]), _as_date(run_row["range_end"])
            )
            bars = list(BarIterator(df))
        null = random_entry_null(
            bars=bars,
            clock=_clock_from_cfg(cfg),
            broker=PaperBroker(
                fees_per_share=cfg.broker.fees_per_share,
                slippage_per_share=cfg.broker.slippage_per_share,
            ),
            n_trades=stats["n_trades"],
            stop_distance=stats["stop_distance"],
            risk_reward=cfg.strategy.vwap_pullback.target.risk_reward,
            quantity=stats["quantity"] or 1.0,
            iterations=sig_cfg.permutation_iterations,
            seed=sig_cfg.seed,
        )

    return compute_significance(
        trade_pnls=stats["trade_pnls"],
        trade_rs=stats["trade_rs"],
        daily_returns=stats["daily_returns"],
        observed_metric=stats["observed_total"],
        null_distribution=null,
        cfg=sig_cfg,
    )


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

    if kind == "walk_forward":
        planned = plan_walk_forward(cfg, params)
    elif kind == "sensitivity":
        from intraday_trade_spy.validation.sweep import planned_evaluations

        planned = planned_evaluations((params or {}).get("grid") or [])
    else:
        raise ValueError(f"unsupported study kind: {kind!r}")
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
    # Feature 014: hand the task the identity context so every evaluation is
    # persisted as a child run tagged with this study.
    background_tasks.add_task(
        run_study_task,
        study_id=study_id,
        kind=kind,
        params=params or {},
        storage=storage,
        config_params=config_params,
        user_id=user_id,
        config_id=cfg_row.get("id"),
        strategy_id=cfg_row.get("strategy_id"),
    )
    return study_id, planned


def _segment_window(segment: str, segs):
    if segment == "train":
        return segs.train
    if segment == "validation":
        return segs.validation
    if segment == "train_validation":
        return segs.train_validation
    raise ValueError(f"unknown segment: {segment!r}")


def _materialize_df(storage, cfg, start, end):
    from intraday_trade_spy.api.lifecycle import materialize_bars_csv
    from intraday_trade_spy.data.loader import load_bars

    csv_path = materialize_bars_csv(storage_client=storage, start=start, end=end)
    return load_bars(csv_path, market=cfg.market)


def run_study_task(
    *,
    study_id,
    kind: str,
    params: dict | None,
    storage,
    cfg: Config | None = None,
    config_params: dict | None = None,
    user_id=None,
    config_id=None,
    strategy_id=None,
    _df=None,
    _engine=None,
    _segment_df=None,
    _evaluate_point=None,
    _persist=None,
) -> None:
    params = params or {}
    try:
        if cfg is None:
            # Built in the background (defers effective-config assembly off the
            # request path); user knobs over the base config.yaml.
            cfg = build_effective_config(config_params or {}, base_path=DEFAULT_CONFIG_PATH)
        segs = _segments(cfg)

        # Feature 014: with the identity context present, every evaluation is
        # persisted as a child run. Without it (older callers / unit tests) the
        # study runs exactly as 011 did — no persistence.
        persist = _persist
        if persist is None and user_id is not None and config_id is not None and strategy_id is not None:
            persist = make_study_persist(
                storage=storage,
                user_id=user_id,
                config_id=config_id,
                strategy_id=strategy_id,
                study_id=study_id,
                config_params=config_params,
            )

        if kind == "walk_forward":
            wf = _build_walk_forward(cfg, params)
            engine = _engine
            if engine is None:
                from intraday_trade_spy.backtest.engine import BacktestEngine

                engine = BacktestEngine(cfg)
            df = _df
            if df is None:
                # Load the full train+validation pool ONCE; run_walk_forward
                # slices it per window (parse-once optimization, FR-024).
                pool = segs.train_validation
                df = _materialize_df(storage, cfg, pool.start, pool.end)
            run_walk_forward_study(
                study_id=study_id, df=df, segments=segs, wf=wf, engine=engine,
                storage=storage, persist=persist,
            )

        elif kind == "sensitivity":
            from intraday_trade_spy.validation.study import run_sensitivity_study
            from intraday_trade_spy.validation.sweep import dotted_to_nested

            grid = params["grid"]
            metric = params.get("metric") or cfg.validation.sensitivity.default_metric
            segment = params.get("segment") or "train"

            evaluate_point = _evaluate_point
            if evaluate_point is None:
                from intraday_trade_spy.backtest.engine import BacktestEngine
                from intraday_trade_spy.config import _deep_merge

                win = _segment_window(segment, segs)
                seg_df = _segment_df if _segment_df is not None else _materialize_df(
                    storage, cfg, win.start, win.end
                )

                def evaluate_point(coords):
                    merged = _deep_merge(config_params or {}, dotted_to_nested(coords))
                    point_cfg = build_effective_config(merged, base_path=DEFAULT_CONFIG_PATH)
                    return BacktestEngine(point_cfg).run_df(seg_df)

            run_sensitivity_study(
                study_id=study_id, grid=grid, metric=metric, segment=segment,
                evaluate_point=evaluate_point, storage=storage, persist=persist,
            )

        else:
            raise ValueError(f"unsupported study kind: {kind!r}")
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
