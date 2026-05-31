"""Unit-level API test fixtures.

Provides a TestClient over the production app where the auth_user_id dep
and the get_storage_client dep are overridden with stubs — no real Supabase
needed. For tests that need a real Supabase, use tests/api/integration/.
"""

from __future__ import annotations

from unittest import mock
from uuid import UUID, uuid4

import pytest


TEST_USER_ID = UUID("11111111-1111-1111-1111-111111111111")


@pytest.fixture()
def stub_storage_client():
    """A MagicMock SupabaseStorageClient that tests can configure per-case."""
    mc = mock.MagicMock()
    mc.user_id = str(TEST_USER_ID)
    return mc


@pytest.fixture()
def unit_client(monkeypatch, stub_storage_client):
    """TestClient with auth + storage dependencies overridden."""
    from fastapi.testclient import TestClient

    # Force env vars so the health check / create_app paths don't read a
    # real .env file.
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-service-role-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-jwt-secret-with-at-least-32-characters-long")

    # Patch create_client BEFORE app construction (it's called in
    # SupabaseStorageClient.__init__ at request time).
    with mock.patch("intraday_trade_spy.storage.client.create_client") as create_client:
        create_client.return_value = mock.MagicMock()
        from intraday_trade_spy.api.app import create_app
        from intraday_trade_spy.api.deps import auth_user_id, get_storage_client

        app = create_app()
        app.dependency_overrides[auth_user_id] = lambda: TEST_USER_ID
        app.dependency_overrides[get_storage_client] = lambda user_id=None: stub_storage_client

        with TestClient(app) as client:
            yield client
            app.dependency_overrides.clear()


pytestmark = pytest.mark.api  # ensure socket-blocker fixture permits TestClient
