"""Feature 019 T016 — campaign storage CRUD (data-model.md, migration 0126).

psycopg-pool-backed like the trial ledger: seq assignment, the one-active
rule surfacing as CampaignAlreadyRunning, cycle append as read-modify-write,
atomic write-once verdict flip, provenance-stamped trial inserts, and the
startup reconciler.
"""

from __future__ import annotations

import json
from unittest import mock

import pytest

USER = "11111111-1111-1111-1111-111111111111"


def _client():
    from intraday_trade_spy.storage import SupabaseStorageClient

    with mock.patch(
        "intraday_trade_spy.storage.client.create_client", return_value=mock.MagicMock()
    ):
        return SupabaseStorageClient(url="https://t.co", service_role_key="k", user_id=USER)


class _FakeCursor:
    def __init__(self, state):
        self._state = state
        self.rowcount = 1

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, params=None):
        self._state["calls"].append((" ".join(sql.split()), params))
        raiser = self._state.get("raise_on")
        if raiser and raiser[0] in sql:
            raise raiser[1]
        self.rowcount = self._state.get("rowcount", 1)

    def fetchone(self):
        return self._state["rows"].pop(0) if self._state.get("rows") else None

    def fetchall(self):
        rows, self._state["rows"] = self._state.get("rows", []), []
        return rows


def _arm(monkeypatch, *, rows=None, raise_on=None, rowcount=1):
    state = {"calls": [], "rows": list(rows or []), "raise_on": raise_on, "rowcount": rowcount}

    class FakeConn:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def cursor(self):
            return _FakeCursor(state)

    class FakePool:
        def connection(self):
            return FakeConn()

    from intraday_trade_spy.storage import db_pool

    monkeypatch.setattr(db_pool, "get_pool", lambda: FakePool())
    return state


def test_insert_campaign_assigns_next_seq_and_returns_the_row(monkeypatch):
    c = _client()
    # INSERT ... RETURNING row (seq computed in SQL from max(seq)+1)
    state = _arm(monkeypatch, rows=[(
        "c-1", 7, "cfg-1", "default", 4, "running", json.dumps({"base_alpha": 0.05}),
        "[]", False, None, None, "2026-06-06T00:00:00Z", "2026-06-06T00:00:00Z",
    )])
    row = c.insert_research_campaign(
        strategy_id="s-1", starting_config_id="cfg-1",
        starting_config_name="default", budget=4,
        thresholds={"base_alpha": 0.05},
    )
    assert row["id"] == "c-1" and row["seq"] == 7
    assert row["status"] == "running" and row["cycles"] == []
    sql = state["calls"][0][0]
    assert "INSERT INTO public.research_campaigns" in sql
    assert "max(seq)" in sql.lower()


def test_second_running_campaign_raises_campaign_already_running(monkeypatch):
    from intraday_trade_spy.storage.client import CampaignAlreadyRunning

    c = _client()

    class UniqueViolation(Exception):
        sqlstate = "23505"

    _arm(monkeypatch, raise_on=("INSERT INTO public.research_campaigns", UniqueViolation()))
    with pytest.raises(CampaignAlreadyRunning):
        c.insert_research_campaign(
            strategy_id="s-1", starting_config_id=None,
            starting_config_name="default", budget=4, thresholds={},
        )


def test_append_campaign_cycle_is_read_modify_write(monkeypatch):
    c = _client()
    existing = [{"cycle": 1, "stages": []}]
    state = _arm(monkeypatch, rows=[(json.dumps(existing),)])
    c.append_campaign_cycle(campaign_id="c-1", cycle_entry={"cycle": 2, "stages": []})
    select_sql = state["calls"][0][0]
    update_sql, update_params = state["calls"][1]
    assert "SELECT cycles" in select_sql
    assert "UPDATE public.research_campaigns" in update_sql
    merged = json.loads(update_params[0])
    assert [e["cycle"] for e in merged] == [1, 2]  # prior entries preserved


def test_halt_campaign_flips_status_and_verdict_in_one_update(monkeypatch):
    c = _client()
    state = _arm(monkeypatch)
    c.halt_research_campaign(
        campaign_id="c-1", status="halted", verdict="ready_for_lockbox",
        verdict_detail={"candidate": "auto01-c2-risk_reward2.5"},
    )
    updates = [s for s, _ in state["calls"] if "UPDATE" in s]
    assert len(updates) == 1  # atomic single statement
    assert "verdict IS NULL" in updates[0]  # write-once guard in SQL


def test_trial_insert_carries_campaign_provenance(monkeypatch):
    c = _client()
    state = _arm(monkeypatch)
    c.insert_recommendation_trial(
        strategy_id="s-1", config_id="cfg-9", config_name="auto01-c2-risk_reward2.5",
        analysis_id=None, source="deterministic",
        campaign_id="c-1", cycle=2, family="strategy.vwap_pullback.target.risk_reward",
    )
    sql, params = state["calls"][0]
    assert "campaign_id" in sql and "cycle" in sql and "family" in sql
    assert "c-1" in params and 2 in params
    assert "strategy.vwap_pullback.target.risk_reward" in params


def test_trial_insert_without_campaign_stays_compatible(monkeypatch):
    c = _client()
    state = _arm(monkeypatch)
    c.insert_recommendation_trial(
        strategy_id="s-1", config_id=None, config_name="manual",
        analysis_id=None, source="claude",
    )
    sql, params = state["calls"][0]
    assert "recommendation_trials" in sql  # 018 call sites keep working


def test_count_family_trials_filters_by_family(monkeypatch):
    c = _client()
    state = _arm(monkeypatch, rows=[(3,)])
    n = c.count_family_trials(strategy_id="s-1", family="risk.max_risk_per_trade_pct")
    assert n == 3
    sql, params = state["calls"][0]
    assert "count" in sql.lower() and "family = %s" in sql
    assert "risk.max_risk_per_trade_pct" in params


def test_fail_running_campaigns_marks_them_failed_with_reason(monkeypatch):
    c = _client()
    state = _arm(monkeypatch, rowcount=2)
    n = c.fail_running_campaigns(reason="service restart")
    assert n == 2
    sql, params = state["calls"][0]
    assert "status = 'running'" in sql
    assert any("service restart" in str(p) for p in params)


def test_request_campaign_cancel_returns_whether_it_was_running(monkeypatch):
    c = _client()
    state = _arm(monkeypatch, rowcount=1)
    assert c.request_campaign_cancel(campaign_id="c-1") is True
    state["rowcount"] = 0
    assert c.request_campaign_cancel(campaign_id="c-1") is False
