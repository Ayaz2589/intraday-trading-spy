"""T019 — validation study background task + stale-study sweep (Feature 011).

`run_study_task` is the background entry: load the pool bars once, build the
engine, delegate to the orchestrator. It swallows exceptions (background task)
but marks the study failed. Unit-tested with injected `_df` + `_engine` + fake
storage so no bars/DB are needed.
"""

from pathlib import Path

import pandas as pd
from types import SimpleNamespace

from intraday_trade_spy.api.validation_lifecycle import run_study_task, sweep_stale_studies
from intraday_trade_spy.config import load_config

CFG = load_config(Path(__file__).resolve().parents[2] / "config" / "config.yaml")


class FakeStorage:
    def __init__(self):
        self.statuses = []

    def update_validation_study(self, *, study_id, status=None, **kw):
        if status:
            self.statuses.append(status)


class FakeEngine:
    def __init__(self, boom=False):
        self.boom = boom
        self.n = 0

    def run_df(self, _df):
        if self.boom:
            raise RuntimeError("engine boom")
        self.n += 1
        s = SimpleNamespace(
            total_trades=1, expectancy_dollars=1.0, expectancy_r=0.1, win_rate=0.5,
            profit_factor=1.1, sharpe=0.2, total_net_pnl_dollars=10.0, low_confidence=False,
        )
        return SimpleNamespace(summary=s, run=SimpleNamespace(run_id=f"r{self.n}"))


def _empty_df():
    return pd.DataFrame({"session_date": pd.Series([], dtype="object")})


def test_run_study_task_happy_finishes():
    storage = FakeStorage()
    run_study_task(
        study_id="s1", kind="walk_forward", params={}, storage=storage, cfg=CFG,
        _df=_empty_df(), _engine=FakeEngine(),
    )
    assert storage.statuses[0] == "running"
    assert storage.statuses[-1] == "finished"


def test_run_study_task_marks_failed_and_swallows():
    storage = FakeStorage()
    # Must NOT raise (background task); must record failed.
    run_study_task(
        study_id="s1", kind="walk_forward", params={}, storage=storage, cfg=CFG,
        _df=_empty_df(), _engine=FakeEngine(boom=True),
    )
    assert "failed" in storage.statuses


def test_run_study_task_rejects_unknown_kind():
    storage = FakeStorage()
    run_study_task(
        study_id="s1", kind="sensitivity", params={}, storage=storage, cfg=CFG,
        _df=_empty_df(), _engine=FakeEngine(),
    )
    assert "failed" in storage.statuses


def test_sweep_stale_studies_delegates_to_client():
    class FakeClient:
        def sweep_stale_studies(self, *, max_age_minutes=15):
            return 3

    assert sweep_stale_studies(client=FakeClient()) == 3
