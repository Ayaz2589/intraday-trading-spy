"""Feature 016 — insights aggregates via the shared psycopg pool (013 pattern).

Edge time-series + config distribution are computed FROM THE TRADES TABLE
(avg/sum of pnl), restricted to provably-OOS rows (segment='validation') and
user-scoped in SQL. Each response carries a snapshot fingerprint that pins
Claude analyses and signals staleness.
"""

from __future__ import annotations

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


EDGE_ROWS = [
    # run_id, study_id, window_index, config_name, range_start, range_end,
    # trades, net_pnl, expectancy_dollars, expectancy_r, pnl_std, created_at
    ("r1", "s1", 0, "wf-rr3", "2019-01-02", "2019-06-28", 227, 118.0, 0.52, 0.018, 39.5, "2026-06-05T00:46:00Z"),
    ("r2", "s1", 1, "wf-rr3", "2019-07-01", "2019-12-31", 216, 90.0, 0.42, 0.015, 38.1, "2026-06-05T00:47:00Z"),
]


def test_edge_timeseries_scopes_to_validation_and_user(monkeypatch):
    captured: dict = {}
    _patch_pool(monkeypatch, EDGE_ROWS, captured)
    c = _client()
    out = c.insights_edge_timeseries()
    sql, params = captured["calls"][0]
    assert "segment = 'validation'" in sql
    assert c.user_id in params
    assert len(out["points"]) == 2
    p0 = out["points"][0]
    assert p0["run_id"] == "r1" and p0["config_name"] == "wf-rr3"
    assert p0["trades"] == 227
    assert p0["expectancy_dollars"] == 0.52


def test_edge_timeseries_optional_config_filter(monkeypatch):
    captured: dict = {}
    _patch_pool(monkeypatch, EDGE_ROWS, captured)
    c = _client()
    c.insights_edge_timeseries(config_name="wf-rr3")
    sql, params = captured["calls"][0]
    assert "config_name" in sql
    assert "wf-rr3" in params


def test_edge_timeseries_fingerprint_is_deterministic_and_sensitive(monkeypatch):
    captured: dict = {}
    _patch_pool(monkeypatch, EDGE_ROWS, captured)
    c = _client()
    a = c.insights_edge_timeseries()["snapshot_fingerprint"]
    b = c.insights_edge_timeseries()["snapshot_fingerprint"]
    assert a == b and len(a) >= 16

    _patch_pool(monkeypatch, EDGE_ROWS[:1], captured)
    smaller = c.insights_edge_timeseries()["snapshot_fingerprint"]
    assert smaller != a


def test_edge_timeseries_empty_archive(monkeypatch):
    captured: dict = {}
    _patch_pool(monkeypatch, [], captured)
    c = _client()
    out = c.insights_edge_timeseries()
    assert out["points"] == []
    assert out["snapshot_fingerprint"] == "empty"


DIST_ROWS = [
    # config_name, windows, windows_positive, pnl_q25, pnl_q50, pnl_q75,
    # exp_q25, exp_q50, exp_q75, total_trades
    ("default", 12, 9, -50.0, 124.0, 420.0, -0.3, 0.6, 1.9, 2600),
    ("wf-rr3", 12, 7, -120.0, 61.0, 510.0, -0.6, 0.3, 2.4, 2607),
]


def test_config_distribution_maps_rows(monkeypatch):
    captured: dict = {}
    _patch_pool(monkeypatch, DIST_ROWS, captured)
    c = _client()
    out = c.insights_config_distribution()
    sql, params = captured["calls"][0]
    assert "segment = 'validation'" in sql
    assert c.user_id in params
    assert len(out["rows"]) == 2
    r = out["rows"][1]
    assert r["config_name"] == "wf-rr3"
    assert r["windows"] == 12 and r["windows_positive"] == 7
    assert r["pnl_q50"] == 61.0
    assert out["snapshot_fingerprint"] != "empty"


def test_config_distribution_empty(monkeypatch):
    captured: dict = {}
    _patch_pool(monkeypatch, [], captured)
    c = _client()
    out = c.insights_config_distribution()
    assert out["rows"] == []
    assert out["snapshot_fingerprint"] == "empty"
