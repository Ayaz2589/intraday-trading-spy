"""Factory reset — DELETE ALL DATA (side-nav button). One transaction wipes
every research/data table user-scoped (bars are the global market cache),
then re-seeds a fresh active 'default' config, re-enables Claude, and writes
the reset itself as the new journal's first event (constitution VII)."""

from __future__ import annotations

from unittest import mock

USER = "11111111-1111-1111-1111-111111111111"


def _client():
    from intraday_trade_spy.storage import SupabaseStorageClient

    with mock.patch(
        "intraday_trade_spy.storage.client.create_client", return_value=mock.MagicMock()
    ):
        c = SupabaseStorageClient(url="https://t.co", service_role_key="k", user_id=USER)
    return c


class _FakeCursor:
    def __init__(self, captured):
        self._captured = captured
        self.rowcount = 1

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, params=None):
        self._captured.setdefault("calls", []).append((sql, params))


def _patch_pool(monkeypatch, captured):
    class FakeConn:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def cursor(self):
            return _FakeCursor(captured)

    class FakePool:
        def connection(self):
            return FakeConn()

    from intraday_trade_spy.storage import db_pool

    monkeypatch.setattr(db_pool, "get_pool", lambda: FakePool())


def _armed_client(monkeypatch, captured):
    c = _client()
    _patch_pool(monkeypatch, captured)
    monkeypatch.setattr(
        c, "list_presets",
        lambda: [{"name": "default", "description": "d", "params": {"risk": {}, "strategy": {}}}],
    )
    monkeypatch.setattr(
        c, "create_config",
        mock.MagicMock(return_value={"id": "new-cfg", "name": "default"}),
    )
    monkeypatch.setattr(c, "set_active_config", mock.MagicMock(return_value={"id": "new-cfg"}))
    monkeypatch.setattr(c, "update_insight_settings", mock.MagicMock())
    monkeypatch.setattr(c, "insert_journal_event", mock.MagicMock())
    return c


EXPECTED_TABLES = [
    "recommendation_trials",
    "insight_analyses",
    "validation_studies",   # cascades child runs -> trades/signals
    "lockbox_ledger",       # un-burns the lockbox: true from-scratch
    "runs",                 # cascades trades/signals/run-scoped journal
    "journal_events",
    "data_download_jobs",
    "backfill_jobs",
    "configs",
    "bars",                 # global market cache (no user column)
]


class TestFactoryReset:
    def test_wipes_every_table_user_scoped_in_fk_safe_order(self, monkeypatch):
        captured: dict = {}
        c = _armed_client(monkeypatch, captured)
        c.factory_reset()
        calls = captured["calls"]
        tables = []
        for sql, params in calls:
            assert sql.strip().startswith("DELETE FROM public.")
            table = sql.split("public.")[1].split()[0]
            tables.append(table)
            if table == "bars":
                assert params is None  # global cache — no user filter
            else:
                assert "user_id = %s" in sql and params == [USER]
        assert tables == EXPECTED_TABLES

    def test_reseeds_default_config_active_and_reenables_claude(self, monkeypatch):
        captured: dict = {}
        c = _armed_client(monkeypatch, captured)
        out = c.factory_reset()
        c.create_config.assert_called_once()
        assert c.create_config.call_args.kwargs["name"] == "default"
        c.set_active_config.assert_called_once_with(config_id="new-cfg")
        kwargs = c.update_insight_settings.call_args.kwargs
        assert kwargs["claude_enabled"] is True and kwargs["disabled_reason"] is None
        assert out["default_config"] == "default"
        assert set(out["deleted"]) == set(EXPECTED_TABLES)

    def test_journals_the_reset_as_the_fresh_journals_first_event(self, monkeypatch):
        captured: dict = {}
        c = _armed_client(monkeypatch, captured)
        c.factory_reset()
        kwargs = c.insert_journal_event.call_args.kwargs
        assert kwargs["kind"] == "lifecycle"
        assert "factory reset" in kwargs["message"].lower()
