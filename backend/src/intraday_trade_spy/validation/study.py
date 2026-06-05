"""Validation study orchestrator (Feature 011, FR-004..006; Feature 014 FR-001/002).

Drives a walk-forward study: mark the study running, evaluate each window via
the (already-loaded) bar frame sliced per window, report progress as each
evaluation completes, then persist the aggregated WalkForwardResult and mark the
study finished. On error the study is marked failed (partial progress remains
visible) and the exception re-raised for the caller (the background task) to log.

Dependencies (engine, storage) are injected so the orchestration is unit-tested
without a DB or real bars. The full history is loaded once by the caller and
passed as `df`; `run_walk_forward` slices it per window (FR: parse once).

Feature 014 closes the 011 FR-005 deferral: an optional injected
`persist(result, *, segment, window_index, coords=None) -> (run_id, persisted)`
callback stores each evaluation as a child run. The orchestrator stays
storage-shape-agnostic — it only stamps the returned (run_id, persisted) onto
the evaluation result; dedup/fail-soft/payload concerns live in the callback
(api/validation_lifecycle.make_study_persist). `persist=None` (the default)
reproduces 011 behavior exactly. A misbehaving callback that raises is treated
as a failed persist (defense in depth — the study's math must never change).
"""

from __future__ import annotations

from types import SimpleNamespace

import pandas as pd

from collections.abc import Callable

from intraday_trade_spy.config import WalkForwardConfig
from intraday_trade_spy.models import SensitivitySurface, WalkForwardResult
from intraday_trade_spy.validation.split import Segments
from intraday_trade_spy.validation.sweep import run_sensitivity
from intraday_trade_spy.validation.walk_forward import run_walk_forward


def _stamp_persistence(result, persist, *, segment, window_index, coords=None):
    """Run the persist callback and return a result view carrying the cloud
    run_id + persisted flag for the aggregators to read. Summary is passed
    through untouched — aggregate math cannot change (SC-003)."""
    try:
        run_id, persisted = persist(
            result, segment=segment, window_index=window_index, coords=coords
        )
    except Exception:  # noqa: BLE001 — callback contract is no-raise; belt & suspenders
        run_id, persisted = result.run.run_id, False
    return SimpleNamespace(
        summary=result.summary,
        run=SimpleNamespace(run_id=str(run_id)),
        persisted=bool(persisted),
    )


def run_walk_forward_study(
    *,
    study_id,
    df: pd.DataFrame,
    segments: Segments,
    wf: WalkForwardConfig,
    engine,
    storage,
    persist=None,
) -> WalkForwardResult:
    storage.update_validation_study(study_id=study_id, status="running")
    completed = 0

    def evaluate(slice_df: pd.DataFrame, *, segment: str, window_index: int):
        nonlocal completed
        result = engine.run_df(slice_df)
        if persist is not None:
            result = _stamp_persistence(
                result, persist, segment=segment, window_index=window_index
            )
        completed += 1
        storage.update_validation_study(study_id=study_id, progress_completed=completed)
        return result

    try:
        result = run_walk_forward(df=df, segments=segments, wf=wf, evaluate=evaluate)
    except Exception as exc:
        storage.update_validation_study(
            study_id=study_id, status="failed", failure_reason=str(exc)
        )
        raise

    storage.update_validation_study(
        study_id=study_id,
        status="finished",
        progress_completed=completed,
        result=result.model_dump(mode="json"),
    )
    return result


def run_sensitivity_study(
    *,
    study_id,
    grid: list[dict],
    metric: str,
    segment: str,
    evaluate_point: Callable[[dict], object],
    storage,
    persist=None,
) -> SensitivitySurface:
    """Run a parameter-sensitivity study: evaluate each grid point (a config
    override) over the chosen segment, reporting progress, then persist the
    surface. `evaluate_point(coords) -> result` is injected (the lifecycle builds
    the config + engine per point); unit-tested with a stub.

    Feature 014: `persist` stores each point as a child run. The grid-point
    ordinal (`completed` before increment) is its window_index; the study's
    segment string is passed verbatim — the callback owns the DB mapping
    (train_validation → NULL)."""
    storage.update_validation_study(study_id=study_id, status="running")
    completed = 0

    def evaluate(coords: dict):
        nonlocal completed
        result = evaluate_point(coords)
        if persist is not None:
            result = _stamp_persistence(
                result, persist, segment=segment, window_index=completed, coords=coords
            )
        completed += 1
        storage.update_validation_study(study_id=study_id, progress_completed=completed)
        return result

    try:
        surface = run_sensitivity(
            grid=grid, metric=metric, segment=segment, evaluate=evaluate
        )
    except Exception as exc:
        storage.update_validation_study(
            study_id=study_id, status="failed", failure_reason=str(exc)
        )
        raise

    storage.update_validation_study(
        study_id=study_id,
        status="finished",
        progress_completed=completed,
        result=surface.model_dump(mode="json"),
    )
    return surface
