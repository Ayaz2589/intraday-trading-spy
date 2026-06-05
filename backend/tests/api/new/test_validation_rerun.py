"""T028 (Feature 014, FR-010) — re-run a study.

`rerun_study` clones an existing study's kind + config + params into a brand
new study via the existing `start_study()` (confirm_large=True — the operator
explicitly re-runs something that already ran once). The original row is never
modified. Unknown ids 404; a deleted config surfaces the existing
config-not-found error.
"""

from unittest import mock
from uuid import UUID, uuid4

import pytest

from intraday_trade_spy.api import validation_lifecycle as vl

pytestmark = pytest.mark.api

USER_ID = UUID("11111111-1111-1111-1111-111111111111")

WF_PARAMS = {"mode": "rolling", "train_months": 12, "step_months": 3, "validation_months": 3}


def _study_row(study_id: str) -> dict:
    # Real stored shape: params.walk_forward holds the original `params`
    # argument for BOTH kinds (see start_study's insert_validation_study call).
    return {
        "id": study_id,
        "kind": "walk_forward",
        "status": "finished",
        "params": {"config_name": "wf-rr3", "walk_forward": {"walk_forward": WF_PARAMS}},
    }


def test_rerun_study_clones_kind_config_and_params(monkeypatch):
    storage = mock.MagicMock()
    sid = str(uuid4())
    storage.get_validation_study.return_value = _study_row(sid)
    tasks = mock.MagicMock()
    captured = {}

    def fake_start_study(**kwargs):
        captured.update(kwargs)
        return "new-study-id", 16

    monkeypatch.setattr(vl, "start_study", fake_start_study)

    new_id, planned = vl.rerun_study(
        study_id=sid, user_id=USER_ID, storage=storage, background_tasks=tasks
    )

    assert (new_id, planned) == ("new-study-id", 16)
    assert captured["kind"] == "walk_forward"
    assert captured["config_name"] == "wf-rr3"
    assert captured["params"] == {"walk_forward": WF_PARAMS}
    assert captured["confirm_large"] is True
    assert captured["user_id"] == USER_ID


def test_rerun_unknown_study_raises(monkeypatch):
    storage = mock.MagicMock()
    storage.get_validation_study.return_value = None

    with pytest.raises(vl.StudyNotFound):
        vl.rerun_study(
            study_id=str(uuid4()), user_id=USER_ID, storage=storage,
            background_tasks=mock.MagicMock(),
        )


def test_rerun_endpoint_202(unit_client, stub_storage_client):
    sid = str(uuid4())
    stub_storage_client.get_validation_study.return_value = _study_row(sid)
    stub_storage_client.get_config_by_name.return_value = {
        "id": str(uuid4()), "strategy_id": str(uuid4()), "params": {},
    }

    r = unit_client.post(f"/api/validation/studies/{sid}/rerun")

    assert r.status_code == 202
    body = r.json()
    assert "study_id" in body and body["study_id"] != sid
    assert body["planned_evaluations"] > 0


def test_rerun_endpoint_404_unknown_study(unit_client, stub_storage_client):
    stub_storage_client.get_validation_study.return_value = None
    r = unit_client.post(f"/api/validation/studies/{uuid4()}/rerun")
    assert r.status_code == 404


def test_rerun_endpoint_404_deleted_config(unit_client, stub_storage_client):
    sid = str(uuid4())
    stub_storage_client.get_validation_study.return_value = _study_row(sid)
    stub_storage_client.get_config_by_name.return_value = None  # config deleted

    r = unit_client.post(f"/api/validation/studies/{sid}/rerun")

    assert r.status_code == 404
