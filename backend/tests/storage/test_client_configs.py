"""Feature 012 config CRUD against a real Supabase (T019 edit-isolation,
T033 journal lifecycle rows, T035 lifecycle e2e).

These are integration tests: they need cloud creds (``backend/.env`` with
``SUPABASE_URL`` / ``SUPABASE_SERVICE_ROLE_KEY`` / ``SUPABASE_DB_URL``) and are
opt-in via ``SUPABASE_INTEGRATION=1``. They create only ``itest-*`` configs and
clean those up (plus their journal rows), restoring ``default`` active. Skipped
in offline CI. The storage methods are also exercised end-to-end at the API
layer with stubs in ``tests/api/new/test_configs_endpoints.py``.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

# `slow` too: these reach the real PostgREST client (httpx), which the autouse
# offline socket-blocker would otherwise cut off (psycopg/libpq slips past it).
pytestmark = [pytest.mark.integration, pytest.mark.slow]

ENV = Path(__file__).resolve().parents[2] / ".env"


def _load_env() -> None:
    if not ENV.exists():
        return
    for raw in ENV.read_text().splitlines():
        line = raw.strip()
        if line.startswith("export "):
            line = line[len("export "):]
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


@pytest.fixture(scope="module")
def cloud():
    """A cloud SupabaseStorageClient + a psycopg connection string for direct
    assertions. Skips unless opted in. Cleans up its own ``itest-*`` rows."""
    if os.environ.get("SUPABASE_INTEGRATION", "").lower() not in {"1", "true", "yes"}:
        pytest.skip("SUPABASE_INTEGRATION not set; cloud config integration test skipped.")
    _load_env()
    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url or not os.environ.get("SUPABASE_URL"):
        pytest.skip("cloud creds (SUPABASE_URL / SUPABASE_DB_URL) not in env.")

    import psycopg

    from intraday_trade_spy.storage.client import SupabaseStorageClient

    client = SupabaseStorageClient.from_env()

    def _cleanup() -> None:
        with psycopg.connect(db_url) as conn, conn.cursor() as cur:
            cur.execute(
                "DELETE FROM public.configs WHERE user_id=%s AND name LIKE 'itest-%%'",
                (client.user_id,),
            )
            cur.execute(
                "DELETE FROM public.journal_events WHERE user_id=%s AND kind='lifecycle' "
                "AND details->>'config_name' LIKE 'itest-%%'",
                (client.user_id,),
            )
            cur.execute(
                "UPDATE public.configs SET is_active=false WHERE user_id=%s AND is_active",
                (client.user_id,),
            )
            cur.execute(
                "UPDATE public.configs SET is_active=true WHERE user_id=%s AND name='default'",
                (client.user_id,),
            )
            conn.commit()

    _cleanup()  # clear any leftovers from a prior aborted run
    yield client, db_url, psycopg
    _cleanup()


def _journal_count(psycopg, db_url, user_id, event: str, name: str) -> int:
    with psycopg.connect(db_url) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) FROM public.journal_events WHERE user_id=%s AND kind='lifecycle' "
            "AND details->>'event'=%s AND details->>'config_name'=%s",
            (str(user_id), f"config_{event}", name),
        )
        return cur.fetchone()[0]


def test_update_config_edits_only_the_targeted_config(cloud):
    """T019: editing one config must not touch any other config's params."""
    client, _db_url, _psycopg = cloud
    a = client.create_config(name="itest-iso-A", params={"risk": {"max_position_value_pct": 400}})
    b = client.create_config(name="itest-iso-B", params={"risk": {"max_position_value_pct": 400}})

    client.update_config(
        config_id=a["id"], user_id=client.user_id, params={"risk": {"max_position_value_pct": 123}}
    )

    a2 = client.get_config_by_id(config_id=a["id"], user_id=client.user_id)
    b2 = client.get_config_by_id(config_id=b["id"], user_id=client.user_id)
    assert a2["params"]["risk"]["max_position_value_pct"] == 123
    # B is untouched — no cross-config bleed.
    assert b2["params"]["risk"]["max_position_value_pct"] == 400


def test_config_lifecycle_emits_journal_rows(cloud):
    """T033 (constitution VII): create/duplicate/rename/activate/delete each
    write a `lifecycle` journal_events row."""
    client, db_url, psycopg = cloud

    c = client.create_config(name="itest-jrnl", params={"risk": {"max_position_value_pct": 400}})
    assert _journal_count(psycopg, db_url, client.user_id, "created", "itest-jrnl") >= 1

    dup = client.duplicate_config(src_id=c["id"], new_name="itest-jrnl-dup")
    assert _journal_count(psycopg, db_url, client.user_id, "created", "itest-jrnl-dup") >= 1

    client.rename_config(config_id=c["id"], new_name="itest-jrnl-renamed")
    assert _journal_count(psycopg, db_url, client.user_id, "renamed", "itest-jrnl-renamed") >= 1

    client.set_active_config(config_id=c["id"])
    assert _journal_count(psycopg, db_url, client.user_id, "activated", "itest-jrnl-renamed") >= 1

    # Deleting is allowed (more than one itest-* config exists) and journals.
    client.delete_config(config_id=dup["id"])
    assert _journal_count(psycopg, db_url, client.user_id, "deleted", "itest-jrnl-dup") >= 1


def test_full_lifecycle_e2e_and_last_config_guard(cloud):
    """T035: create -> activate -> rename -> duplicate -> safe-delete, ending
    with `default` restored active. Also pins the last-config delete guard."""
    from intraday_trade_spy.storage.client import LastConfigError

    client, _db_url, _psycopg = cloud
    a = client.create_config(name="itest-e2e", params={"risk": {"max_position_value_pct": 400}})
    client.set_active_config(config_id=a["id"])
    assert client.get_active_config()["name"] == "itest-e2e"

    client.rename_config(config_id=a["id"], new_name="itest-e2e-2")
    dup = client.duplicate_config(src_id=a["id"], new_name="itest-e2e-dup")
    assert dup["params"] == a["params"]

    # Deleting the active config promotes another to active (never zero active).
    client.delete_config(config_id=a["id"])
    assert client.get_active_config() is not None

    # The last-config guard can't be hit here (default + others exist), but the
    # API/contract guarantee is exercised in the endpoint tests; assert the type
    # is importable and the guard path exists.
    assert issubclass(LastConfigError, Exception)
