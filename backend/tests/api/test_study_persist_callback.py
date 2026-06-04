"""T006 (Feature 014, FR-001/002/005/006) — make_study_persist().

The persist callback owns the lifecycle context (user/config/strategy ids,
config params) and the three behaviors the orchestrator must never see:
spec-hash dedup, post-push stamping, and fail-soft error handling. It NEVER
raises — a persistence failure returns (local_run_id, False).
"""

from unittest import mock
from uuid import UUID

import pytest

from intraday_trade_spy.api.validation_lifecycle import make_study_persist
from intraday_trade_spy.run_spec import compute_spec_hash

USER_ID = UUID("11111111-1111-1111-1111-111111111111")
CONFIG_ID = UUID("22222222-2222-2222-2222-222222222222")
STRATEGY_ID = UUID("33333333-3333-3333-3333-333333333333")
STUDY_ID = UUID("44444444-4444-4444-4444-444444444444")

RR = "strategy.vwap_pullback.target.risk_reward"


@pytest.fixture()
def storage():
    mc = mock.MagicMock()
    mc.user_id = str(USER_ID)
    mc.find_finished_run_by_spec.return_value = None
    return mc


def _persist(storage, **over):
    kwargs = dict(
        storage=storage,
        user_id=USER_ID,
        config_id=CONFIG_ID,
        strategy_id=STRATEGY_ID,
        study_id=STUDY_ID,
        config_params={},
    )
    kwargs.update(over)
    return make_study_persist(**kwargs)


def test_success_pushes_tagged_child_and_stamps(engine_result, storage):
    persist = _persist(storage)

    run_id, persisted = persist(engine_result, segment="train", window_index=2)

    assert persisted is True
    storage.push_run.assert_called_once()
    payload = storage.push_run.call_args.args[0]
    assert str(payload.run.id) == run_id
    assert payload.run.study_id == STUDY_ID
    assert payload.run.segment == "train"
    assert payload.run.window_index == 2
    # Post-push stamps follow the api/lifecycle.py pattern.
    storage.set_run_spec_hash.assert_called_once()
    assert str(storage.set_run_spec_hash.call_args.kwargs["run_id"]) == run_id
    storage.set_run_config_snapshot.assert_called_once()
    snap = storage.set_run_config_snapshot.call_args.kwargs["config_snapshot"]
    assert set(snap) == {"risk", "strategy"}


def test_train_validation_segment_maps_to_null(engine_result, storage):
    """0111's CHECK allows only NULL/'train'/'validation'/'lockbox' — a combined
    train+validation evaluation is stored with segment NULL (analyze I1)."""
    persist = _persist(storage)
    _, persisted = persist(engine_result, segment="train_validation", window_index=0)
    assert persisted is True
    payload = storage.push_run.call_args.args[0]
    assert payload.run.segment is None


def test_dedup_hit_references_existing_run_without_push(engine_result, storage):
    storage.find_finished_run_by_spec.return_value = "existing-run-id"
    persist = _persist(storage)

    run_id, persisted = persist(engine_result, segment="validation", window_index=1)

    assert (run_id, persisted) == ("existing-run-id", True)
    storage.push_run.assert_not_called()


def test_push_failure_is_fail_soft(engine_result, storage):
    storage.push_run.side_effect = RuntimeError("supabase down")
    persist = _persist(storage)

    run_id, persisted = persist(engine_result, segment="train", window_index=0)

    assert persisted is False
    assert run_id == engine_result.run.run_id  # falls back to the local id


def test_coords_merge_into_spec_hash_and_snapshot(engine_result, storage):
    """Sensitivity children hash + snapshot the per-point effective params
    (base params deep-merged with the grid point's dotted overrides)."""
    persist = _persist(storage)
    fp = engine_result.run.data_fingerprint

    persist(engine_result, segment="train", window_index=0)
    base_hash = storage.set_run_spec_hash.call_args.kwargs["spec_hash"]
    base_snap = storage.set_run_config_snapshot.call_args.kwargs["config_snapshot"]

    persist(engine_result, segment="train", window_index=1, coords={RR: 9.0})
    point_hash = storage.set_run_spec_hash.call_args.kwargs["spec_hash"]
    point_snap = storage.set_run_config_snapshot.call_args.kwargs["config_snapshot"]

    assert point_hash != base_hash
    expected = compute_spec_hash(
        strategy_id=str(STRATEGY_ID),
        params={"strategy": {"vwap_pullback": {"target": {"risk_reward": 9.0}}}},
        symbol="SPY",
        range_start=fp.earliest_timestamp.date(),
        range_end=fp.latest_timestamp.date(),
    )
    assert point_hash == expected
    assert point_snap["strategy"]["vwap_pullback"]["target"]["risk_reward"] == 9.0
    assert base_snap["strategy"]["vwap_pullback"]["target"]["risk_reward"] != 9.0
