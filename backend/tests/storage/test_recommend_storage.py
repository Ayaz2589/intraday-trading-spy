"""Feature 018 — recommend storage (T015 US2 sensitivity fetch; T031 US3 trial
ledger lands in this file too). Fake-cursor pattern over the shared psycopg
pool (013): user-scoped SQL with deterministic ORDER BY."""

from __future__ import annotations

import json
from unittest import mock


def _client():
    from intraday_trade_spy.storage import SupabaseStorageClient

    with mock.patch(
        "intraday_trade_spy.storage.client.create_client", return_value=mock.MagicMock()
    ):
        return SupabaseStorageClient(
            url="https://t.co", service_role_key="k",
            user_id="11111111-1111-1111-1111-111111111111",
        )


class _FakeCursor:
    def __init__(self, rows, captured):
        self._rows = rows
        self._captured = captured

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, params=None):
        self._captured.setdefault("calls", []).append((sql, params))

    def fetchall(self):
        return self._rows


def _patch_pool(monkeypatch, rows, captured):
    class FakeConn:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def cursor(self):
            return _FakeCursor(rows, captured)

    class FakePool:
        def connection(self):
            return FakeConn()

    from intraday_trade_spy.storage import db_pool

    monkeypatch.setattr(db_pool, "get_pool", lambda: FakePool())


SURFACE = {
    "metric_name": "expectancy_r",
    "knobs": ["strategy.vwap_pullback.target.risk_reward"],
    "axes": {"strategy.vwap_pullback.target.risk_reward": [1.5, 2.0, 2.5, 3.0]},
    "points": [
        {"coords": {"strategy.vwap_pullback.target.risk_reward": v},
         "metric": m, "trade_count": 50, "low_confidence": False,
         "run_id": f"r{i}", "persisted": True}
        for i, (v, m) in enumerate([(1.5, 0.0), (2.0, 0.005), (2.5, 0.03), (3.0, 0.032)])
    ],
    "segment": "validation",
}

SENS_ROWS = [
    ("study-1", "default", json.dumps(SURFACE), "2026-06-01T00:00:00Z"),
]


class TestListSensitivitySurfaces:
    def test_scopes_to_user_and_kind_with_deterministic_order(self, monkeypatch):
        captured: dict = {}
        _patch_pool(monkeypatch, SENS_ROWS, captured)
        out = _client().list_sensitivity_surfaces()
        sql, params = captured["calls"][0]
        assert "kind = 'sensitivity'" in sql
        assert "status = 'finished'" in sql
        assert "user_id = %s" in sql
        assert "ORDER BY" in sql
        assert params[0] == "11111111-1111-1111-1111-111111111111"
        assert len(out) == 1
        row = out[0]
        assert row["study_id"] == "study-1"
        assert row["config_name"] == "default"
        assert row["surface"]["metric_name"] == "expectancy_r"
        assert row["surface"]["knobs"] == ["strategy.vwap_pullback.target.risk_reward"]

    def test_tolerates_dict_result_rows(self, monkeypatch):
        # psycopg may hand JSONB back already-decoded — both shapes parse.
        captured: dict = {}
        _patch_pool(monkeypatch, [("study-2", "wf-rr3", SURFACE, "2026-06-02T00:00:00Z")], captured)
        out = _client().list_sensitivity_surfaces()
        assert out[0]["surface"]["segment"] == "validation"


# ---- T031 (US3): the trial ledger — insert + family counts -------------------


class TestRecommendationTrials:
    def test_insert_writes_user_scoped_row(self, monkeypatch):
        captured: dict = {}
        _patch_pool(monkeypatch, [], captured)
        _client().insert_recommendation_trial(
            strategy_id="strat-1", config_id="cfg-1", config_name="default-exp-1",
            analysis_id="ia-1", source="claude",
        )
        sql, params = captured["calls"][0]
        assert "INSERT INTO public.recommendation_trials" in sql
        assert params[0] == "11111111-1111-1111-1111-111111111111"  # user first
        assert "strat-1" in params and "cfg-1" in params
        assert "default-exp-1" in params and "ia-1" in params and "claude" in params

    def test_counts_scope_by_user_and_strategy_family(self, monkeypatch):
        # U5: same config_name under two strategies counts separately —
        # the SQL must filter strategy_id, not just name.
        captured: dict = {}
        _patch_pool(monkeypatch, [(3, 2)], captured)
        out = _client().recommendation_trial_counts(strategy_id="strat-1")
        sql, params = captured["calls"][0]
        assert "FROM public.recommendation_trials" in sql
        assert "user_id = %s" in sql
        assert "strategy_id = %s" in sql
        assert params == ["11111111-1111-1111-1111-111111111111", "strat-1"]
        assert out == {"drafted": 3, "validated": 2}

    def test_validated_joins_by_config_name_so_counts_survive_deletion(self, monkeypatch):
        # Deletion survival: config_id nulls on delete (FK), so the
        # validated join must key on the denormalized config_name against
        # finished walk-forward studies — never on the configs table.
        captured: dict = {}
        _patch_pool(monkeypatch, [(0, 0)], captured)
        _client().recommendation_trial_counts(strategy_id="strat-1")
        sql, _ = captured["calls"][0]
        assert "config_name" in sql
        assert "walk_forward" in sql
        assert "finished" in sql
        assert "JOIN public.configs" not in sql

    def test_empty_ledger_yields_zero_counts(self, monkeypatch):
        captured: dict = {}
        _patch_pool(monkeypatch, [], captured)
        out = _client().recommendation_trial_counts(strategy_id="strat-1")
        assert out == {"drafted": 0, "validated": 0}
