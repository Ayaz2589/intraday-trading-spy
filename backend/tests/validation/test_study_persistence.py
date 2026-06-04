"""T008 (Feature 014, FR-001/002/006/007 + SC-003) — orchestrator persist wiring.

The study orchestrator calls an injected `persist(result, *, segment,
window_index, coords=None) -> (run_id, persisted)` per evaluation and stamps
the returned (run_id, persisted) into WindowMetrics / SensitivityPoint.
With persist=None behavior is byte-identical to 011. Aggregate math NEVER
changes — healthy, absent, or raising persistence all yield equal metrics.
"""

from datetime import date
from types import SimpleNamespace

import pandas as pd

from intraday_trade_spy.config import SplitWindowConfig, WalkForwardConfig
from intraday_trade_spy.validation.split import Segments
from intraday_trade_spy.validation.study import (
    run_sensitivity_study,
    run_walk_forward_study,
)


class FakeStorage:
    def __init__(self):
        self.calls = []

    def update_validation_study(self, *, study_id, status=None, progress_completed=None,
                                result=None, failure_reason=None):
        self.calls.append(
            dict(status=status, progress_completed=progress_completed,
                 result=result, failure_reason=failure_reason)
        )


class FakeEngine:
    def __init__(self):
        self.n = 0

    def run_df(self, _df):
        self.n += 1
        summary = SimpleNamespace(
            total_trades=10 * self.n, expectancy_dollars=float(self.n),
            expectancy_r=0.01 * self.n, win_rate=0.5, profit_factor=1.1,
            sharpe=0.2, total_net_pnl_dollars=100.0 * self.n, low_confidence=False,
        )
        return SimpleNamespace(summary=summary, run=SimpleNamespace(run_id=f"run{self.n}"))


def _segments():
    return Segments(
        train=SplitWindowConfig(start=date(2020, 1, 1), end=date(2020, 9, 30)),
        validation=SplitWindowConfig(start=date(2020, 10, 1), end=date(2020, 12, 31)),
        lockbox=SplitWindowConfig(start=date(2025, 1, 1), end=date(2026, 12, 31)),
    )


def _wf():
    return WalkForwardConfig(mode="rolling", train_months=6, step_months=3, validation_months=3)


def _run_wf(persist):
    return run_walk_forward_study(
        study_id="s1",
        df=pd.DataFrame({"session_date": pd.Series([], dtype="object")}),
        segments=_segments(), wf=_wf(), engine=FakeEngine(),
        storage=FakeStorage(), persist=persist,
    )


class RecordingPersist:
    def __init__(self):
        self.calls = []

    def __call__(self, result, *, segment, window_index, coords=None):
        self.calls.append(dict(segment=segment, window_index=window_index, coords=coords))
        return f"cloud-{len(self.calls)}", True


def test_walk_forward_stamps_cloud_ids_and_persisted():
    persist = RecordingPersist()
    result = _run_wf(persist)

    # 2 windows × (IS + OOS) = 4 evaluations, each persisted.
    assert len(persist.calls) == 4
    assert [c["segment"] for c in persist.calls] == ["train", "validation"] * 2
    assert [c["window_index"] for c in persist.calls] == [0, 0, 1, 1]
    flat = [w.in_sample for w in result.windows] + [w.out_of_sample for w in result.windows]
    assert all(m.persisted for m in flat)
    assert {m.run_id for m in flat} == {"cloud-1", "cloud-2", "cloud-3", "cloud-4"}


def test_walk_forward_without_persist_is_unchanged():
    result = _run_wf(None)
    flat = [m for w in result.windows for m in (w.in_sample, w.out_of_sample)]
    assert all(not m.persisted for m in flat)
    assert {m.run_id for m in flat} == {"run1", "run2", "run3", "run4"}


def test_walk_forward_aggregates_identical_across_persist_modes():
    """SC-003: persistence is additive — metrics math never changes."""
    def raising(result, *, segment, window_index, coords=None):
        raise RuntimeError("storage exploded")

    dumps = []
    for persist in (None, RecordingPersist(), raising):
        d = _run_wf(persist).model_dump(mode="json")
        for w in d["windows"]:
            for side in ("in_sample", "out_of_sample"):
                w[side].pop("run_id")
                w[side].pop("persisted")
        dumps.append(d)
    assert dumps[0] == dumps[1] == dumps[2]


def test_walk_forward_raising_persist_marks_not_drillable():
    def raising(result, *, segment, window_index, coords=None):
        raise RuntimeError("boom")

    result = _run_wf(raising)
    flat = [m for w in result.windows for m in (w.in_sample, w.out_of_sample)]
    assert all(not m.persisted for m in flat)
    assert {m.run_id for m in flat} == {"run1", "run2", "run3", "run4"}  # local ids kept


RR = "strategy.vwap_pullback.target.risk_reward"


def _run_sensitivity(persist):
    def evaluate_point(coords):
        s = SimpleNamespace(expectancy_dollars=coords[RR], total_trades=50, low_confidence=False)
        return SimpleNamespace(summary=s, run=SimpleNamespace(run_id=f"r{coords[RR]}"))

    return run_sensitivity_study(
        study_id="s2", grid=[{"knob": RR, "values": [1.5, 2.0, 2.5]}],
        metric="expectancy_dollars", segment="train_validation",
        evaluate_point=evaluate_point, storage=FakeStorage(), persist=persist,
    )


def test_sensitivity_stamps_cloud_ids_ordinals_and_coords():
    persist = RecordingPersist()
    surface = _run_sensitivity(persist)

    assert [c["window_index"] for c in persist.calls] == [0, 1, 2]
    # The orchestrator passes the study's segment verbatim; the persist
    # callback owns the DB mapping (train_validation → NULL, tested in T006).
    assert {c["segment"] for c in persist.calls} == {"train_validation"}
    assert [c["coords"][RR] for c in persist.calls] == [1.5, 2.0, 2.5]
    assert [p.run_id for p in surface.points] == ["cloud-1", "cloud-2", "cloud-3"]
    assert all(p.persisted for p in surface.points)


def test_sensitivity_without_persist_is_unchanged():
    surface = _run_sensitivity(None)
    assert [p.run_id for p in surface.points] == ["r1.5", "r2.0", "r2.5"]
    assert all(not p.persisted for p in surface.points)


def test_sensitivity_metrics_identical_across_persist_modes():
    def raising(result, *, segment, window_index, coords=None):
        raise RuntimeError("boom")

    dumps = []
    for persist in (None, RecordingPersist(), raising):
        d = _run_sensitivity(persist).model_dump(mode="json")
        for p in d["points"]:
            p.pop("run_id")
            p.pop("persisted")
        dumps.append(d)
    assert dumps[0] == dumps[1] == dumps[2]
