"""T032 (Feature 014, FR-008) — list_runs hides study children.

The main runs list/sidebar shows only standalone runs (`study_id IS NULL`).
Children are reached through their study. Standalone runs a study merely
referenced via dedup keep study_id NULL, so they stay listed by definition.
"""

from unittest import mock
from uuid import uuid4

from intraday_trade_spy.storage.client import SupabaseStorageClient


def _client_with_query_recorder():
    """A SupabaseStorageClient over a chain-recording fake supabase client."""
    calls = []

    class _Query:
        def __init__(self):
            self.data = []

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
            resp.data = []
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


def test_list_runs_filters_out_study_children():
    client, calls = _client_with_query_recorder()

    client.list_runs(user_id=client.user_id, limit=20, cursor=None)

    assert ("is_", ("study_id", "null")) in calls, (
        f"list_runs must filter study_id IS NULL; recorded query: {calls}"
    )


def test_list_runs_keeps_existing_ordering_and_pagination():
    client, calls = _client_with_query_recorder()

    client.list_runs(user_id=client.user_id, limit=20, cursor=None)

    names = [c[0] for c in calls]
    assert names.index("order") < names.index("execute")
    assert ("limit", (21,)) in calls  # limit+1 page probe unchanged
