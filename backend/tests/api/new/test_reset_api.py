"""POST /api/reset/all — the side-nav Delete-all-data endpoint. Destructive,
explicit, user-scoped; returns what it deleted."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.api


def test_factory_reset_returns_counts_and_new_default(unit_client, stub_storage_client):
    stub_storage_client.factory_reset.return_value = {
        "deleted": {"runs": 12, "validation_studies": 3, "bars": 168424, "configs": 2},
        "default_config": "default",
    }
    r = unit_client.post("/api/reset/all")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["deleted"]["bars"] == 168424
    assert body["default_config"] == "default"
    stub_storage_client.factory_reset.assert_called_once()


def test_factory_reset_is_post_only(unit_client, stub_storage_client):
    assert unit_client.get("/api/reset/all").status_code == 405
    assert unit_client.delete("/api/reset/all").status_code == 405
