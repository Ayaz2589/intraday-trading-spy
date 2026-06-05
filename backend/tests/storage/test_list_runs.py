"""list_runs lists EVERY run — study children included.

Supersedes 014's FR-008 (study_id IS NULL filter): individual backtest
creation is gone, so /runs is the chronological index of all backtests.
Origin badges distinguish study children; each row carries `study_kind`
flattened from the validation_studies FK embed.
"""

from unittest import mock
from uuid import uuid4

from intraday_trade_spy.storage.client import SupabaseStorageClient


def _client_with_query_recorder(rows=None):
    """A SupabaseStorageClient over a chain-recording fake supabase client."""
    calls = []

    class _Query:
        def _record(self, name, *args):
            calls.append((name, args))
            return self

        def select(self, *a):
            return self._record("select", *a)

        def eq(self, *a):
            return self._record("eq", *a)

        def is_(self, *a):
            return self._record("is_", *a)

        def order(self, *a, **kw):
            return self._record("order", *a)

        def limit(self, *a):
            return self._record("limit", *a)

        def lt(self, *a):
            return self._record("lt", *a)

        def execute(self):
            calls.append(("execute", ()))
            resp = mock.MagicMock()
            resp.data = list(rows or [])
            return resp

    fake = mock.MagicMock()
    fake.table.return_value = _Query()

    with mock.patch("intraday_trade_spy.storage.client.create_client", return_value=fake):
        client = SupabaseStorageClient(
            url="https://test.supabase.co",
            service_role_key="fake-key",
            user_id=str(uuid4()),
        )
    return client, calls


def test_list_runs_does_not_hide_study_children():
    client, calls = _client_with_query_recorder()

    client.list_runs(user_id=client.user_id, limit=20, cursor=None)

    assert not any(name == "is_" for name, _ in calls), (
        f"014's study_id IS NULL filter must be gone; recorded query: {calls}"
    )


def test_list_runs_embeds_study_kind():
    client, calls = _client_with_query_recorder()

    client.list_runs(user_id=client.user_id, limit=20, cursor=None)

    assert ("select", ("*, validation_studies(kind)",)) in calls, (
        f"expected FK embed select; recorded query: {calls}"
    )


def test_list_runs_flattens_embed_to_study_kind():
    child = {
        "id": "r1",
        "started_at": "2026-06-04T14:11:00+00:00",
        "validation_studies": {"kind": "walk_forward"},
    }
    standalone = {
        "id": "r2",
        "started_at": "2026-06-03T09:02:00+00:00",
        "validation_studies": None,
    }
    client, _ = _client_with_query_recorder(rows=[child, standalone])

    page = client.list_runs(user_id=client.user_id, limit=20, cursor=None)

    assert page.runs[0]["study_kind"] == "walk_forward"
    assert page.runs[1]["study_kind"] is None
    assert "validation_studies" not in page.runs[0], "embed must be flattened away"


def test_list_runs_keeps_existing_ordering_and_pagination():
    client, calls = _client_with_query_recorder()

    client.list_runs(user_id=client.user_id, limit=20, cursor=None)

    names = [c[0] for c in calls]
    assert names.index("order") < names.index("execute")
    assert ("limit", (21,)) in calls  # limit+1 page probe unchanged
