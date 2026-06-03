"""T017 — walk-forward study orchestrator (Feature 011, FR-004/006).

Drives the study lifecycle: mark running → run each window evaluation via
engine.run_df (progress updates) → persist the aggregated WalkForwardResult and
mark finished. Unit-tested with an injected fake storage + fake engine, so the
orchestration is verifiable without a DB or real bars.
"""

from datetime import date
from types import SimpleNamespace

import pandas as pd
import pytest

from intraday_trade_spy.config import SplitWindowConfig, WalkForwardConfig
from intraday_trade_spy.models import WalkForwardResult
from intraday_trade_spy.validation.split import Segments
from intraday_trade_spy.validation.study import run_walk_forward_study


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


def test_orchestrator_runs_progress_and_finalizes():
    wf = WalkForwardConfig(mode="rolling", train_months=6, step_months=3, validation_months=3)
    storage = FakeStorage()
    engine = FakeEngine()
    df = pd.DataFrame({"session_date": pd.Series([], dtype="object")})

    result = run_walk_forward_study(
        study_id="s1", df=df, segments=_segments(), wf=wf, engine=engine, storage=storage
    )

    assert isinstance(result, WalkForwardResult)
    assert len(result.windows) == 2

    statuses = [c["status"] for c in storage.calls if c["status"]]
    assert statuses[0] == "running" and statuses[-1] == "finished"
    # 2 windows × (IS + OOS) = 4 evaluations → progress 1..4 during the run, then
    # the finished call re-persists the final count (4).
    progresses = [c["progress_completed"] for c in storage.calls if c["progress_completed"] is not None]
    assert progresses == [1, 2, 3, 4, 4]
    assert max(progresses) == 4
    # Finished call carries the serialized result.
    finished = [c for c in storage.calls if c["status"] == "finished"][0]
    assert finished["result"]["mode"] == "rolling"
    assert "mean_oos" in finished["result"]


def test_orchestrator_marks_failed_on_error():
    class BoomEngine:
        def run_df(self, _df):
            raise RuntimeError("boom")

    wf = WalkForwardConfig(mode="rolling", train_months=6, step_months=3, validation_months=3)
    storage = FakeStorage()
    df = pd.DataFrame({"session_date": pd.Series([], dtype="object")})

    with pytest.raises(RuntimeError, match="boom"):
        run_walk_forward_study(
            study_id="s1", df=df, segments=_segments(), wf=wf, engine=BoomEngine(), storage=storage
        )
    assert any(c["status"] == "failed" for c in storage.calls)
