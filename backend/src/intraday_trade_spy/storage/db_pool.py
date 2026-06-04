"""Shared psycopg connection pool for the R8 direct-Postgres aggregates.

Feature 013 perf fix (SC-005): each `psycopg.connect()` to cloud Supabase pays
a fresh TLS handshake (~1s). The coverage endpoint opened four per request and
the stats endpoint one — the Data page spent seconds just connecting. One
process-wide pool amortizes that to ~nothing after the first request.

`check=ConnectionPool.check_connection` revalidates idle connections on
checkout, so a connection the Supabase pooler silently dropped is replaced
instead of failing the request.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

# Fallback when config.yaml is unreadable; the operative value lives in
# config.yaml (api.db_pool_max_size — engineering standard: limits in config).
DEFAULT_POOL_MAX_SIZE = 4


def _pool_max_size() -> int:
    try:
        import yaml

        raw = yaml.safe_load(Path("config/config.yaml").read_text())
        return int(((raw or {}).get("api") or {}).get("db_pool_max_size", DEFAULT_POOL_MAX_SIZE))
    except Exception:  # noqa: BLE001
        return DEFAULT_POOL_MAX_SIZE


@lru_cache(maxsize=1)
def get_pool():
    """The process-wide pool. Built lazily on first use; raises KeyError-free
    RuntimeError if SUPABASE_DB_URL is unset (callers surface their own error)."""
    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        raise RuntimeError("SUPABASE_DB_URL not set; direct-DB aggregates unavailable")

    from psycopg_pool import ConnectionPool

    return ConnectionPool(
        db_url,
        min_size=0,  # don't hold connections the app isn't using
        max_size=_pool_max_size(),
        check=ConnectionPool.check_connection,
        open=True,
    )
