"""Validation study orchestrator (Feature 011, FR-004..006).

Drives a walk-forward study: mark the study running, evaluate each window via
the (already-loaded) bar frame sliced per window, report progress as each
evaluation completes, then persist the aggregated WalkForwardResult and mark the
study finished. On error the study is marked failed (partial progress remains
visible) and the exception re-raised for the caller (the background task) to log.

Dependencies (engine, storage) are injected so the orchestration is unit-tested
without a DB or real bars. The full history is loaded once by the caller and
passed as `df`; `run_walk_forward` slices it per window (FR: parse once).

NOTE: per-evaluation child-run *persistence* (FR-005 drill-down / SC-008 dedup
reuse) is a follow-up within US1 — this MVP persists the aggregated study result
(the IS-vs-OOS table), which is the core value. The WindowMetrics run_ids are
the in-memory evaluation ids until child-run persistence lands.
"""

from __future__ import annotations

import pandas as pd

from intraday_trade_spy.config import WalkForwardConfig
from intraday_trade_spy.models import WalkForwardResult
from intraday_trade_spy.validation.split import Segments
from intraday_trade_spy.validation.walk_forward import run_walk_forward


def run_walk_forward_study(
    *,
    study_id,
    df: pd.DataFrame,
    segments: Segments,
    wf: WalkForwardConfig,
    engine,
    storage,
) -> WalkForwardResult:
    storage.update_validation_study(study_id=study_id, status="running")
    completed = 0

    def evaluate(slice_df: pd.DataFrame, *, segment: str, window_index: int):
        nonlocal completed
        result = engine.run_df(slice_df)
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
