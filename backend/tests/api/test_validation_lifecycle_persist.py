"""T010 (Feature 014, FR-001/002) — run_study_task builds + injects persist.

The lifecycle owns user/config/strategy context, so it constructs the persist
callback and hands it to the orchestrator. Identity kwargs are optional: tests
(and any context without them) run exactly as before — no persistence.
`_persist` is injectable like `_engine`/`_df` so wiring is testable offline.
"""

from datetime import date
from types import SimpleNamespace
from unittest import mock
from uuid import UUID

import pandas as pd
import pytest

from intraday_trade_spy.api import validation_lifecycle as vl

USER_ID = UUID("11111111-1111-1111-1111-111111111111")
CONFIG_ID = UUID("22222222-2222-2222-2222-222222222222")
STRATEGY_ID = UUID("33333333-3333-3333-3333-333333333333")

RR = "strategy.vwap_pullback.target.risk_reward"


class FakeStorage:
    def __init__(self):
        self.updates = []

    def update_validation_study(self, **kw):
        self.updates.append(kw)


class FakeEngine:
    def __init__(self):
        self.n = 0

    def run_df(self, _df):
        self.n += 1
        summary = SimpleNamespace(
            total_trades=10, expectancy_dollars=1.0, expectancy_r=0.01,
            win_rate=0.5, profit_factor=1.1, sharpe=0.2,
            total_net_pnl_dollars=100.0, low_confidence=False,
        )
        return SimpleNamespace(summary=summary, run=SimpleNamespace(run_id=f"run{self.n}"))


class RecordingPersist:
    def __init__(self):
        self.calls = []

    def __call__(self, result, *, segment, window_index, coords=None):
        self.calls.append(dict(segment=segment, window_index=window_index, coords=coords))
        return f"cloud-{len(self.calls)}", True


def _wf_params():
    return {"mode": "rolling", "train_months": 6, "step_months": 3, "validation_months": 3}


def _empty_df():
    return pd.DataFrame({"session_date": pd.Series([], dtype="object")})


def test_walk_forward_task_passes_injected_persist_through():
    storage = FakeStorage()
    persist = RecordingPersist()

    vl.run_study_task(
        study_id="s1", kind="walk_forward", params=_wf_params(), storage=storage,
        _engine=FakeEngine(), _df=_empty_df(), _persist=persist,
    )

    assert [u.get("status") for u in storage.updates if u.get("status")] == ["running", "finished"]
    assert len(persist.calls) > 0
    assert {c["segment"] for c in persist.calls} == {"train", "validation"}
    assert all(c["coords"] is None for c in persist.calls)


def test_sensitivity_task_passes_coords_and_ordinals():
    storage = FakeStorage()
    persist = RecordingPersist()

    def evaluate_point(coords):
        s = SimpleNamespace(expectancy_dollars=coords[RR], total_trades=5, low_confidence=True)
        return SimpleNamespace(summary=s, run=SimpleNamespace(run_id=f"r{coords[RR]}"))

    vl.run_study_task(
        study_id="s2", kind="sensitivity",
        params={"grid": [{"knob": RR, "values": [1.5, 2.0]}], "metric": "expectancy_dollars",
                "segment": "train_validation"},
        storage=storage, _evaluate_point=evaluate_point, _persist=persist,
    )

    assert [u.get("status") for u in storage.updates if u.get("status")] == ["running", "finished"]
    assert [c["coords"][RR] for c in persist.calls] == [1.5, 2.0]
    assert [c["window_index"] for c in persist.calls] == [0, 1]
    assert {c["segment"] for c in persist.calls} == {"train_validation"}


def test_task_without_identity_or_persist_does_not_persist():
    """Backward compat: no identity kwargs and no _persist → 011 behavior."""
    storage = FakeStorage()
    vl.run_study_task(
        study_id="s3", kind="walk_forward", params=_wf_params(), storage=storage,
        _engine=FakeEngine(), _df=_empty_df(),
    )
    finished = [u for u in storage.updates if u.get("status") == "finished"]
    assert finished, f"study should finish, got {storage.updates}"
    windows = finished[0]["result"]["windows"]
    assert all(not w["in_sample"]["persisted"] for w in windows)


def test_task_with_identity_builds_persist_via_factory(monkeypatch):
    """When user/config/strategy ids are provided, the task constructs the
    callback through make_study_persist with that exact context."""
    storage = FakeStorage()
    captured = {}

    def fake_factory(**kwargs):
        captured.update(kwargs)
        return RecordingPersist()

    monkeypatch.setattr(vl, "make_study_persist", fake_factory)

    vl.run_study_task(
        study_id="s4", kind="walk_forward", params=_wf_params(), storage=storage,
        config_params={"risk": {"account_value": 25000}},
        user_id=USER_ID, config_id=CONFIG_ID, strategy_id=STRATEGY_ID,
        _engine=FakeEngine(), _df=_empty_df(),
    )

    assert captured["user_id"] == USER_ID
    assert captured["config_id"] == CONFIG_ID
    assert captured["strategy_id"] == STRATEGY_ID
    assert captured["study_id"] == "s4"
    assert captured["config_params"] == {"risk": {"account_value": 25000}}
    assert captured["storage"] is storage


def test_start_study_enqueues_identity_kwargs():
    """start_study must hand the background task the persistence context."""
    storage = mock.MagicMock()
    storage.get_config_by_name.return_value = {
        "id": str(CONFIG_ID), "strategy_id": str(STRATEGY_ID), "params": {},
    }
    storage.insert_validation_study.return_value = None
    tasks = mock.MagicMock()

    vl.start_study(
        user_id=USER_ID, kind="walk_forward", config_name="default",
        params=_wf_params(), confirm_large=True, storage=storage,
        background_tasks=tasks,
    )

    kwargs = tasks.add_task.call_args.kwargs
    assert kwargs["user_id"] == USER_ID
    assert str(kwargs["config_id"]) == str(CONFIG_ID)
    assert str(kwargs["strategy_id"]) == str(STRATEGY_ID)
