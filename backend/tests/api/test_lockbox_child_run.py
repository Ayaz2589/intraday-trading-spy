"""T012 (Feature 014, FR-003) — the lockbox one-shot persists its child run.

The lockbox evaluation becomes a real run (`segment='lockbox'`, `study_id`
NULL) and the append-only ledger row references it at insert time (the ledger
is immutable — no post-hoc update). `get_lockbox_status_view` surfaces the
run_id. Persistence failure is fail-soft: the spend is still recorded.
"""

from unittest import mock
from uuid import UUID

import pytest

from intraday_trade_spy.api.validation_lifecycle import (
    get_lockbox_status_view,
    run_lockbox,
)
from intraday_trade_spy.config import load_config
from intraday_trade_spy.data.loader import load_bars

USER_ID = UUID("11111111-1111-1111-1111-111111111111")
CONFIG_ID = UUID("22222222-2222-2222-2222-222222222222")
STRATEGY_ID = UUID("33333333-3333-3333-3333-333333333333")


@pytest.fixture()
def storage():
    mc = mock.MagicMock()
    mc.user_id = str(USER_ID)
    mc.get_config_by_name.return_value = {
        "id": str(CONFIG_ID), "strategy_id": str(STRATEGY_ID), "params": {},
    }
    mc.get_lockbox_ledger.return_value = []      # unspent
    mc.find_finished_run_by_spec.return_value = None
    return mc


@pytest.fixture()
def lockbox_inputs(default_config_path, sample_csv_path):
    from intraday_trade_spy.backtest.engine import BacktestEngine

    cfg = load_config(default_config_path)
    df = load_bars(sample_csv_path, market=cfg.market)
    return cfg, BacktestEngine(cfg), df


def test_lockbox_spend_persists_child_and_links_ledger(storage, lockbox_inputs):
    cfg, engine, df = lockbox_inputs

    out = run_lockbox(
        user_id=USER_ID, config_name="default", override=False,
        storage=storage, base_cfg=cfg, _df=df, _engine=engine,
    )

    storage.push_run.assert_called_once()
    payload = storage.push_run.call_args.args[0]
    assert payload.run.segment == "lockbox"
    assert payload.run.study_id is None
    assert payload.run.window_index is None

    child_id = str(payload.run.id)
    ledger_kwargs = storage.append_lockbox_row.call_args.kwargs
    assert str(ledger_kwargs["run_id"]) == child_id
    assert out["run_id"] == child_id
    assert out["state"] == "spent"


def test_lockbox_persist_failure_still_spends(storage, lockbox_inputs):
    cfg, engine, df = lockbox_inputs
    storage.push_run.side_effect = RuntimeError("supabase down")

    out = run_lockbox(
        user_id=USER_ID, config_name="default", override=False,
        storage=storage, base_cfg=cfg, _df=df, _engine=engine,
    )

    # The spend is the critical, immutable record — it must land regardless.
    storage.append_lockbox_row.assert_called_once()
    assert storage.append_lockbox_row.call_args.kwargs.get("run_id") is None
    assert out["state"] == "spent"
    assert out["run_id"] is None


def test_status_view_surfaces_ledger_run_id(storage, default_config_path):
    cfg = load_config(default_config_path)
    storage.get_lockbox_ledger.return_value = [
        {"state": "spent", "config_fingerprint": "fp1",
         "run_id": "aaaa1111-0000-0000-0000-000000000000",
         "result": {"total_trades": 3}, "created_at": "2026-06-04T00:00:00Z"},
    ]

    view = get_lockbox_status_view(user_id=USER_ID, storage=storage, base_cfg=cfg)

    assert view["run_id"] == "aaaa1111-0000-0000-0000-000000000000"
