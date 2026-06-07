"""Feature 019 T018 — /api/research/campaigns HTTP contract
(contracts/research-api.md): start/list/detail/cancel + the startup
reconciler. GETs are pure reads; the engine task is stubbed out.
"""

from uuid import uuid4

import pytest

pytestmark = pytest.mark.api


def _campaign_row(**over):
    row = {
        "id": str(uuid4()),
        "seq": 1,
        "strategy_id": str(uuid4()),
        "starting_config_id": str(uuid4()),
        "starting_config_name": "default",
        "budget": 4,
        "status": "running",
        "verdict": None,
        "verdict_detail": None,
        "cancel_requested": False,
        "thresholds": {"base_alpha": 0.05},
        "cycles": [],
        "created_at": "2026-06-06T00:00:00Z",
        "updated_at": "2026-06-06T00:00:00Z",
    }
    row.update(over)
    return row


@pytest.fixture
def no_engine(monkeypatch):
    """The router enqueues the engine via BackgroundTasks; TestClient would run
    it synchronously — stub it out and capture the invocations."""
    calls = []

    from intraday_trade_spy.api.routers import research as research_router

    monkeypatch.setattr(research_router, "run_campaign_task",
                        lambda **kw: calls.append(kw))
    return calls


def test_start_campaign_202_inserts_and_enqueues(unit_client, stub_storage_client, no_engine):
    cfg_id, strat_id = str(uuid4()), str(uuid4())
    stub_storage_client.get_config_by_name.return_value = {
        "id": cfg_id, "name": "default", "strategy_id": strat_id, "params": {},
    }
    row = _campaign_row(starting_config_id=cfg_id, strategy_id=strat_id)
    stub_storage_client.insert_research_campaign.return_value = row

    resp = unit_client.post("/api/research/campaigns",
                            json={"config_name": "default", "budget": 4})
    assert resp.status_code == 202, resp.text
    body = resp.json()
    assert body["status"] == "running" and body["cycles"] == []
    assert body["trials_used"] == 0
    kwargs = stub_storage_client.insert_research_campaign.call_args.kwargs
    assert kwargs["starting_config_name"] == "default"
    assert kwargs["budget"] == 4
    assert kwargs["thresholds"]["base_alpha"] == 0.05  # frozen at launch
    assert len(no_engine) == 1  # the engine was enqueued exactly once


def test_start_campaign_defaults_budget_from_config(unit_client, stub_storage_client, no_engine):
    stub_storage_client.get_config_by_name.return_value = {
        "id": str(uuid4()), "name": "default", "strategy_id": str(uuid4()), "params": {},
    }
    stub_storage_client.insert_research_campaign.return_value = _campaign_row(budget=6)
    resp = unit_client.post("/api/research/campaigns", json={"config_name": "default"})
    assert resp.status_code == 202
    assert stub_storage_client.insert_research_campaign.call_args.kwargs["budget"] == 6


def test_start_campaign_404_unknown_config(unit_client, stub_storage_client, no_engine):
    stub_storage_client.get_config_by_name.return_value = None
    resp = unit_client.post("/api/research/campaigns", json={"config_name": "ghost"})
    assert resp.status_code == 404
    assert resp.json()["detail"]["error"] == "config_not_found"


def test_start_campaign_409_when_one_is_running(unit_client, stub_storage_client, no_engine):
    from intraday_trade_spy.storage.client import CampaignAlreadyRunning

    stub_storage_client.get_config_by_name.return_value = {
        "id": str(uuid4()), "name": "default", "strategy_id": str(uuid4()), "params": {},
    }
    stub_storage_client.insert_research_campaign.side_effect = CampaignAlreadyRunning("c-9")
    resp = unit_client.post("/api/research/campaigns", json={"config_name": "default"})
    assert resp.status_code == 409
    assert resp.json()["detail"]["error"] == "campaign_already_running"
    assert no_engine == []  # nothing enqueued


def test_list_campaigns_includes_default_budget(unit_client, stub_storage_client):
    stub_storage_client.list_research_campaigns.return_value = [
        _campaign_row(status="halted", verdict="stop_tuning"),
    ]
    resp = unit_client.get("/api/research/campaigns")
    assert resp.status_code == 200
    body = resp.json()
    assert body["default_budget"] == 6  # from config.yaml research.default_budget
    assert body["campaigns"][0]["verdict"] == "stop_tuning"


def test_get_campaign_detail_computes_trials_used(unit_client, stub_storage_client):
    cycles = [
        {"cycle": 1, "stages": [
            {"stage": "gate", "status": "fail", "detail": {"k": 1, "level": 0.95}},
            {"stage": "act", "status": "ok",
             "detail": {"action": "knob_delta", "trial_id": "t-1"}},
        ]},
        {"cycle": 2, "stages": [
            {"stage": "gate", "status": "pass", "detail": {"k": 2, "level": 0.975}},
        ]},
    ]
    row = _campaign_row(status="halted", verdict="ready_for_lockbox", cycles=cycles)
    stub_storage_client.get_research_campaign.return_value = row
    resp = unit_client.get(f"/api/research/campaigns/{row['id']}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["trials_used"] == 1
    assert body["cycles"] == cycles  # persisted truth, verbatim


def test_get_campaign_404(unit_client, stub_storage_client):
    stub_storage_client.get_research_campaign.return_value = None
    resp = unit_client.get(f"/api/research/campaigns/{uuid4()}")
    assert resp.status_code == 404


def test_get_endpoints_are_pure_reads(unit_client, stub_storage_client):
    stub_storage_client.list_research_campaigns.return_value = []
    unit_client.get("/api/research/campaigns")
    stub_storage_client.get_research_campaign.return_value = _campaign_row()
    unit_client.get(f"/api/research/campaigns/{uuid4()}")
    for writer in ("insert_research_campaign", "halt_research_campaign",
                   "append_campaign_cycle", "request_campaign_cancel"):
        assert not getattr(stub_storage_client, writer).called


def test_cancel_running_campaign_200(unit_client, stub_storage_client):
    stub_storage_client.request_campaign_cancel.return_value = True
    resp = unit_client.post(f"/api/research/campaigns/{uuid4()}/cancel")
    assert resp.status_code == 200
    assert resp.json()["cancel_requested"] is True


def test_cancel_halted_campaign_409(unit_client, stub_storage_client):
    stub_storage_client.request_campaign_cancel.return_value = False
    resp = unit_client.post(f"/api/research/campaigns/{uuid4()}/cancel")
    assert resp.status_code == 409
    assert resp.json()["detail"]["error"] == "not_running"


def test_startup_reconciler_fails_running_campaigns_explicitly():
    from unittest import mock

    from intraday_trade_spy.api.routers.research import reconcile_interrupted_campaigns

    storage = mock.MagicMock()
    storage.fail_running_campaigns.return_value = 1
    n = reconcile_interrupted_campaigns(storage)
    assert n == 1
    assert storage.fail_running_campaigns.call_args.kwargs["reason"] == "service restart"
